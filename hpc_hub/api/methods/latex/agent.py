import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from ....agents import catalog
from ....core import config
from ....files import remote_fs
from ....latex import assist, history
from ....terminals import tmux
from ...hub import hub
from ...server import method
from ..tools import _with_node

_lock = threading.Lock()
_choice_lock = threading.Lock()


@dataclass
class _Job:
    id: str
    cluster: str
    folder: str
    kind: str
    node: str
    label: str
    cancelled: bool = False


_jobs: dict[str, _Job] = {}


def _saved_choice() -> tuple[assist.Choice, bool]:
    app = config.load_app(config.APP_FILE)
    try:
        return assist.check(app.paper_agent, app.paper_model, app.paper_effort), app.paper_split
    except ValueError:
        return assist.DEFAULT, app.paper_split


def _choice_json(c: assist.Choice, split: bool) -> dict:
    return {"agent": c.agent, "model": c.model, "effort": c.effort, "split": split, "label": assist.label(c),
            "agents": assist.describe()}


@method("latex.agent_choice")
def agent_choice() -> dict:
    return _choice_json(*_saved_choice())


@method("latex.agent_choose")
def agent_choose(agent: str | None = None, model: str | None = None, effort: str | None = None,
                 split: bool | None = None) -> dict:
    """Kept for every paper; what is not given stays."""
    with _choice_lock:
        app = config.load_app(config.APP_FILE)
        c = _saved_choice()[0]
        if agent is not None:
            c = assist.switch(c, agent)
        c = assist.check(c.agent, c.model if model is None else model, c.effort if effort is None else effort)
        app.paper_agent, app.paper_model, app.paper_effort = c.agent, c.model, c.effort
        if split is not None:
            app.paper_split = bool(split)
        config.save_app(app, config.APP_FILE)
        return _choice_json(c, app.paper_split)


def _choice(override: dict | None) -> assist.Choice:
    """Your choice, or for one question another model and effort of the same agent."""
    c = _saved_choice()[0]
    if override:
        return assist.check(c.agent, str(override.get("model", c.model)), str(override.get("effort", c.effort)))
    return c


def _why(code: int, err: str, agent: catalog.Agent, cluster: str) -> str:
    if code == 127 or "command not found" in err:
        return f"{agent.name} isn't installed on {cluster}, or not on the PATH of a login shell there"
    if code == 124:
        return f"{agent.name} took more than {assist.TIMEOUT // 60} minutes, so it was stopped"
    lines = [x for x in err.strip().splitlines() if x.strip() and "terminal process group" not in x
             and "no job control" not in x]
    return lines[-1] if lines else f"{agent.name} stopped (exit {code})"


def uncommitted(ssh, folder: str) -> tuple[dict, dict]:
    """The state and the changes not committed yet; a paper with none has nothing for the agent."""
    st = history.state(ssh, folder)
    if not st.get("root"):
        raise RuntimeError("This paper is not in git yet")
    if not st["changes"]:
        raise RuntimeError("Nothing changed since your last commit")
    return st, history.changes(ssh, folder, "", "", 3)


def start(kind: str, cluster: str, folder: str, override: dict | None, build: Callable[..., tuple]) -> dict:
    """build(ssh) -> (prompt, answer -> result, what it covers) runs on a thread, then the agent on your node.
    The job reports as `latex-agent` events."""
    s = hub().connected(cluster)
    a = _with_node(s, s.allocation)
    if not (a and a.node):
        raise RuntimeError(f"The agent runs on a compute node. Get one on {s.cfg.name} first.")
    c = _choice(override)
    agent = catalog.BY_ID[c.agent]
    command = getattr(getattr(s.cfg, agent.id, None), "command", "") or ""
    job = _Job(secrets.token_hex(6), cluster, folder, kind, a.node, assist.label(c))
    with _lock:
        _jobs[job.id] = job
    h, started = hub(), time.monotonic()

    def emit(**extra):
        h.emit("latex-agent", {"id": job.id, "cluster": cluster, "folder": folder, "kind": kind, "node": job.node,
                               "label": job.label, "done": False, "seconds": round(time.monotonic() - started, 1),
                               **extra})

    def work():
        try:
            emit(stage="preparing")
            prompt, finish, about = build(s.ssh)
            if job.cancelled:
                emit(done=True, ok=False, cancelled=True)
                return
            remote_fs.pipe(s.ssh, assist.prepare_script(job.id, assist.run_script(job.id, agent, command, c)), [],
                           prompt.encode())
            emit(stage="running", about=about)
            res = s.ssh.run(tmux.on(job.node, assist.start_line(job.id)), timeout=assist.TIMEOUT + 60)
            if job.cancelled:
                emit(done=True, ok=False, cancelled=True)
                return
            if res.returncode != 0:
                raise RuntimeError(_why(res.returncode, res.stderr, agent, s.cfg.name))
            emit(done=True, ok=True, result=finish(assist.answer(res.stdout)))
        except Exception as e:  # noqa: BLE001 (it goes to the app as the job's end)
            emit(done=True, ok=False, cancelled=job.cancelled, error=str(e) or type(e).__name__)
        finally:
            with _lock:
                _jobs.pop(job.id, None)
    threading.Thread(target=work, daemon=True, name=f"paper-agent-{kind}-{job.id}").start()
    return {"id": job.id, "node": job.node, "label": job.label, "agent": c.agent}


@method("latex.agent_cancel")
def agent_cancel(id: str) -> bool:  # noqa: A002 - the contract's name
    assist.check_id(id)
    with _lock:
        job = _jobs.get(id)
    if not job:
        return False
    job.cancelled = True
    try:
        hub().connected(job.cluster).ssh.run(tmux.on(job.node, assist.cancel_line(id)), timeout=30)
    except Exception:  # noqa: BLE001 (the job ends as cancelled anyway)
        pass
    return True
