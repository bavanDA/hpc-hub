"""The agent's help in a paper's History (latex/assist.py) and its notes (latex/notes.py).

latex.agent_write, latex.agent_ask and latex.agent_check answer {id, node, label} at once; the agent runs on your
compute node in the background (one headless call, no tools) and the job reports as `latex-agent` events {id,
cluster, folder, kind: write|ask|check, node, label, done, stage: preparing|running, ok, error, cancelled, result,
seconds}. latex.agent_cancel stops one. Git runs over the connection; only the agent runs on the node."""

import posixpath
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from ...agents import catalog
from ...core import config
from ...files import remote_fs
from ...latex import assist, git, history, notes
from ...terminals import tmux
from ..hub import hub
from ..server import method
from .tools import _with_node

_lock = threading.Lock()
_choice_lock = threading.Lock()
MAX_QUESTION = 2000
MAX_SNIPPET = 6000  # characters of a selection or a hunk the app sends along


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


# -- the choice ----------------------------------------------------------------------------------------------------
def _saved_choice() -> tuple[assist.Choice, bool]:
    app = config.load_app(config.APP_FILE)
    try:
        return assist.check(app.paper_agent, app.paper_model, app.paper_effort), app.paper_split
    except ValueError:
        return assist.Choice(*assist.PRESETS["fast"]), app.paper_split


def _choice_json(c: assist.Choice, split: bool) -> dict:
    return {"agent": c.agent, "model": c.model, "effort": c.effort, "split": split, "preset": assist.preset(c),
            "label": assist.label(c), "agents": assist.describe(),
            "presets": {k: {"agent": a, "model": m, "effort": e} for k, (a, m, e) in assist.PRESETS.items()}}


@method("latex.agent_choice")
def agent_choice() -> dict:
    """Your agent for Write message, Ask and Check my list: {agent, model, effort, split, preset (fast, careful,
    thorough or ""), label, agents: [{id, name, models, efforts}], presets}."""
    return _choice_json(*_saved_choice())


@method("latex.agent_choose")
def agent_choose(agent: str, model: str = "", effort: str = "", split: bool | None = None) -> dict:
    """Keep a new choice (for every paper, in app.toml). Answers it as latex.agent_choice."""
    c = assist.check(agent, model, effort)
    with _choice_lock:
        app = config.load_app(config.APP_FILE)
        app.paper_agent, app.paper_model, app.paper_effort = c.agent, c.model, c.effort
        if split is not None:
            app.paper_split = bool(split)
        config.save_app(app, config.APP_FILE)
        return _choice_json(c, app.paper_split)


def _choice(override: dict | None) -> assist.Choice:
    if override:
        return assist.check(str(override.get("agent", "")), str(override.get("model", "")),
                            str(override.get("effort", "")))
    return _saved_choice()[0]


# -- jobs ----------------------------------------------------------------------------------------------------------
def _why(code: int, err: str, agent: catalog.Agent, cluster: str) -> str:
    if code == 127 or "command not found" in err:
        return f"{agent.name} isn't installed on {cluster}, or not on the PATH of a login shell there"
    if code == 124:
        return f"{agent.name} took more than {assist.TIMEOUT // 60} minutes, so it was stopped"
    lines = [x for x in err.strip().splitlines() if x.strip() and "terminal process group" not in x
             and "no job control" not in x]
    return lines[-1] if lines else f"{agent.name} stopped (exit {code})"


def _start(kind: str, cluster: str, folder: str, override: dict | None, build: Callable[..., tuple]) -> dict:
    """build(ssh) -> (prompt, read(answer) -> result, what it covers) runs on the thread, then the agent."""
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
    """Stop a job. Nothing it would have answered is shown."""
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


def _now(ssh, folder: str) -> tuple[dict, dict]:
    """The state and the changes not committed yet; a paper with none can't be written about."""
    st = history.state(ssh, folder)
    if not st.get("root"):
        raise RuntimeError("This paper is not in git yet")
    if not st["changes"]:
        raise RuntimeError("Nothing changed since your last commit")
    return st, history.changes(ssh, folder, "", "", 3)


# -- Write message -------------------------------------------------------------------------------------------------
@method("latex.agent_write")
def agent_write(cluster: str, folder: str, split: bool = True, choice: dict | None = None) -> dict:
    """Write a commit message for the changes not committed yet. The result: {subject, body, commits: [{subject,
    body, files}] (a suggested split, or []), files (the changes it saw), head}. Nothing is committed."""
    def build(ssh):
        st, ch = _now(ssh, folder)
        subjects = [x["subject"] for x in history.log(ssh, folder, "HEAD", assist.SUBJECTS, stats=False)]
        paths = [f["path"] for f in st["changes"]]
        prompt = assist.message_prompt(assist.diff_text(ch), st["changes"], subjects, bool(split))
        about = {"files": len(paths), "lines": sum(f["added"] + f["removed"] for f in st["changes"])}
        return prompt, lambda text: {**assist.parse_message(text, paths), "files": st["changes"],
                                     "head": st["head"]}, about
    return _start("write", cluster, folder, choice, build)


@method("latex.git_commit_split")
def git_commit_split(cluster: str, folder: str, commits: list[dict]) -> dict:
    """The suggested commits, in order: [{message, files}] (files from the repository's top). The last one takes
    everything left, so nothing stays behind. {commits}."""
    if len(commits) < 2:
        raise ValueError("Give at least two commits")
    ssh = hub().connected(cluster).ssh
    done = 0
    for i, c in enumerate(commits):
        message = str(c.get("message", "")).strip()
        if not message:
            raise ValueError("Every commit needs a message")
        try:
            if i == len(commits) - 1:
                git.commit_all(ssh, folder, message)
            else:
                git.commit_paths(ssh, folder, message, [str(p) for p in c.get("files") or []])
        except git.GitError as e:
            raise git.GitError(f"{done} of {len(commits)} committed, then: {e}") from e
        done += 1
    return {"commits": done}


# -- Ask -----------------------------------------------------------------------------------------------------------
def _clip(text: str, n: int = MAX_SNIPPET) -> str:
    text = str(text or "")
    return text if len(text) <= n else text[:n] + "\n[... the rest left out]"


def _lines_material(ssh, folder: str, about: dict) -> tuple[str, str]:
    path = str(about.get("path", "")).strip()
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Bad path")
    line = max(1, int(about.get("line") or 1))
    end = max(line, int(about.get("end") or line))
    at = str(about.get("at") or "")
    if at:
        text = history.file_at(ssh, folder, at, path)
    else:
        root = history.state(ssh, folder)["root"]
        text = remote_fs.read_bytes(ssh, posixpath.join(root, path)).decode("utf-8", "replace")
    where = f"{path}, line {line}" if end == line else f"{path}, lines {line} to {end}"
    when = f" as of commit {at[:7]}" if at else " as it is now"
    parts = [f"{where}{when}, with the lines around them:\n{assist.numbered(text, line, end)}"]
    if about.get("text"):
        parts.append(f"The selected text: {_clip(about['text'], 2000)!r}")
    if about.get("diff"):
        parts.append(f"The change there:\n{_clip(about['diff'])}")
    if about.get("page"):
        parts.append(f"It is on page {int(about['page'])} of the PDF.")
    title = ("the selected text in " if about.get("text") else "") + where
    return title, "\n\n".join(parts)


def _material(ssh, folder: str, about: dict) -> tuple[str, str]:
    """(one line on what the question is about, what the agent gets to read)."""
    kind = about.get("kind")
    if kind == "commit":
        c = history.commit(ssh, folder, str(about.get("hash", "")))
        diff = assist.diff_text(history.changes(ssh, folder, "", c["hash"], 3))
        return (f"commit {c['short']} \"{c['subject']}\"",
                f"Commit {c['short']} by {c['author']}: {c['subject']}\n{c['body']}\n\nIts diff:\n{diff}")
    if kind == "range":
        frm, to = str(about.get("frm", "")), str(about.get("to", ""))
        diff = assist.diff_text(history.changes(ssh, folder, frm, to, 3))
        between = history.log(ssh, folder, to or "HEAD", 200, stats=False)
        if frm:
            between = between[:next((i for i, x in enumerate(between) if x["hash"].startswith(frm)), len(between))]
        subjects = "\n".join(f"- {x['short']} {x['author']}: {x['subject']}" for x in between[:40])
        title = f"what changed from {frm[:7] or 'the start'} to {to[:7] or 'the files now'}"
        return title, f"Commits in between:\n{subjects or '- (none)'}\n\nThe diff:\n{diff}"
    if kind in ("lines", "pdf"):
        if kind == "pdf" and not about.get("path"):
            page = int(about.get("page") or 1)
            return f"a spot on page {page} of the PDF", f"Text near that spot:\n{_clip(about.get('text', ''))}"
        return _lines_material(ssh, folder, about)
    if kind == "now":
        _, ch = _now(ssh, folder)
        return "the changes not committed yet", f"The diff:\n{assist.diff_text(ch)}"
    raise ValueError("Ask about a commit, a change, some lines or a spot in the PDF")


@method("latex.agent_ask")
def agent_ask(cluster: str, folder: str, question: str, about: dict, choice: dict | None = None) -> dict:
    """Ask about a change. about: {kind: commit, hash} | {kind: range, frm, to} | {kind: now} | {kind: lines, path,
    line, end, at, text, diff} | {kind: pdf, page, path?, line?, text}. choice changes the agent for this question
    only. The result: {text, cites: [{ref, path, line, end, page}], question}."""
    q = (question or "").strip()
    if not q:
        raise ValueError("Write a question first")
    q = q[:MAX_QUESTION]

    def build(ssh):
        title, material = _material(ssh, folder, about or {})
        return (assist.ask_prompt(q, title, material), lambda text: {**assist.parse_answer(text), "question": q},
                {"title": title})
    return _start("ask", cluster, folder, choice, build)


# -- Notes and Check my list ---------------------------------------------------------------------------------------
@method("latex.notes")
def notes_list(cluster: str, folder: str) -> dict:
    """{notes: [{id, n, text, place, author, time, done, done_by, done_at}], user}. place: {path, line} (from the
    repository's top) | {page, x, y} (PDF points from the page's top) | {hash} | None."""
    return notes.load(hub().connected(cluster).ssh, folder)


@method("latex.note_add")
def note_add(cluster: str, folder: str, text: str, place: dict | None = None) -> dict:
    return notes.add(hub().connected(cluster).ssh, folder, text, place)


@method("latex.note_set")
def note_set(cluster: str, folder: str, id: str, text: str | None = None,  # noqa: A002
             done: bool | None = None) -> dict:
    return notes.update(hub().connected(cluster).ssh, folder, id, text, done)


@method("latex.note_delete")
def note_delete(cluster: str, folder: str, id: str) -> None:  # noqa: A002
    notes.remove(hub().connected(cluster).ssh, folder, id)


@method("latex.agent_check")
def agent_check(cluster: str, folder: str, choice: dict | None = None) -> dict:
    """Check my list: the open notes against the changes not committed yet. The result: {checked, results: [{id,
    verdict: done|not_yet|unsure, reason, path, line}]}. Nothing is checked off: you do that."""
    def build(ssh):
        open_ = [n for n in notes.load(ssh, folder)["notes"] if not n.get("done")]
        if not open_:
            raise RuntimeError("No open notes to check")
        _, ch = _now(ssh, folder)
        prompt = assist.check_prompt(open_, assist.diff_text(ch))
        return prompt, lambda text: {"checked": len(open_), "results": assist.parse_check(text, open_)}, \
            {"notes": len(open_)}
    return _start("check", cluster, folder, choice, build)
