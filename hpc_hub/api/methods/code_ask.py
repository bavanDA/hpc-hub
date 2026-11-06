"""Until an ask's folder exists on the cluster its state lives here; after that the cluster is the
truth, so asks survive the app."""

import json
import shlex
import threading
from dataclasses import asdict, dataclass

from ...agents import ask_all, catalog
from ...code import asks
from ...core import remote
from ...terminals import tmux
from ..hub import hub
from ..server import method
from .tools import _node


@dataclass
class _Pending:
    ask: asks.Ask
    cluster: str
    state: str = "starting"
    why: str = ""
    cancelled: bool = False


_pending: dict[str, _Pending] = {}
_lock = threading.Lock()


def _agent(agent: str) -> catalog.Agent:
    if agent not in catalog.BY_ID:
        raise ValueError(f"No agent {agent}")
    return catalog.BY_ID[agent]


def agent_command(a: catalog.Agent, settings) -> str:
    """The agent once, headless, with the prompt run.sh wrote. Claude answers JSON, which carries its chat id."""
    line = ask_all.headless(a, settings, '"$OUT/prompt.md"')
    if a is catalog.CLAUDE:
        line = line.replace(" -p ", " -p --output-format json ", 1)
    return line


def tmux_line(a: asks.Ask) -> str:
    """Start run.sh on the node in its own tmux session (a login shell, so the agent's PATH is there)."""
    run = f"bash -ic {shlex.quote(asks.run_line(a))}"
    line = (f"if command -v tmux >/dev/null 2>&1; then tmux new-session -d -s {shlex.quote(a.session)} "
            f"{shlex.quote(run)}; else nohup {run} >/dev/null 2>&1 & fi")
    return tmux.on(a.node, line)


def _status(p: _Pending) -> dict:
    a = p.ask
    detail = p.why if p.state == "failed" and p.why else asks.detail(p.state, a.agent_name, a.path)
    return asdict(asks.Status(a.id, p.state, a.kind, a.agent, a.path, a.started, detail))


def _launch(p: _Pending, node: str) -> None:
    s = hub().connected(p.cluster)
    a, agent = p.ask, catalog.BY_ID[p.ask.agent]
    settings = getattr(s.cfg, agent.id)
    try:
        if not remote.command_type(s.ssh, settings.command or agent.id):
            raise RuntimeError(f"{agent.name} isn't installed on {s.cfg.name}")
        if not node:
            alloc = s.allocation
            if not (alloc and alloc.node):
                p.state = "waiting_for_node"
            node = alloc.node if alloc and alloc.node else _node(s, None).node
        if p.cancelled:
            p.state = "cancelled"
            return
        a.node = node
        res = s.ssh.run(asks.start_command(a, asks.script(a, agent_command(agent, settings)), tmux_line(a)),
                        timeout=60)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "Could not start the agent")
    except Exception as e:  # noqa: BLE001 - shown on the ask's card
        p.state, p.why = "failed", f"Didn't start: {e}"
        return
    with _lock:
        _pending.pop(a.id, None)  # the cluster has it now


@method("code.ask_start")
def ask_start(cluster: str, path: str, agent: str, kind: str, question: str = "", error_text: str = "",
              from_line: int = 0, to_line: int = 0, node: str = "") -> dict:
    """Ask agent about path (from_line..to_line, or the whole file) on the cluster. Answers the ask's status;
    follow it with code.ask_status, then read code.ask_result."""
    s = hub().connected(cluster)
    a = _agent(agent)
    if kind not in asks.KINDS:
        raise ValueError(f"No kind of ask {kind}")
    if not path.strip():
        raise ValueError("Open a file first")
    if kind == "free" and not question.strip():
        raise ValueError("Write a question first")
    if kind == "fix" and not (question.strip() or error_text.strip()):
        raise ValueError("Paste the error first")
    from_line, to_line = max(0, int(from_line or 0)), max(0, int(to_line or 0))
    if to_line and to_line < from_line:
        from_line, to_line = to_line, from_line
    ask = asks.Ask(asks.new_id(), a.id, a.name, kind, path.strip(), question, error_text, from_line, to_line,
                   node.strip())
    p = _Pending(ask, s.cfg.id)
    with _lock:
        _pending[ask.id] = p
    threading.Thread(target=_launch, args=(p, ask.node), daemon=True).start()
    return _status(p)


def _fetch(cluster: str, ask_id: str) -> asks.Status | None:
    res = hub().connected(cluster).ssh.run(asks.list_command(ask_id=ask_id), timeout=30)
    found = asks.parse_list(res.stdout)
    return found[0] if found else None


@method("code.ask_status")
def ask_status(cluster: str, id: str) -> dict:  # noqa: A002 - the contract's name
    asks.check_id(id)
    with _lock:
        p = _pending.get(id)
    if p and p.cluster == cluster:
        return _status(p)
    st = _fetch(cluster, id)
    if not st:
        raise ValueError("That ask is gone")
    return asdict(st)


@method("code.asks")
def list_asks(cluster: str) -> list[dict]:
    with _lock:
        mine = [_status(p) for p in _pending.values() if p.cluster == cluster]
    res = hub().connected(cluster).ssh.run(asks.list_command(), timeout=30)
    seen = {x["id"] for x in mine}
    theirs = [asdict(s) for s in asks.parse_list(res.stdout) if s.id not in seen]
    return sorted(mine + theirs, key=lambda x: x["started"], reverse=True)


@method("code.ask_result")
def ask_result(cluster: str, id: str) -> dict:  # noqa: A002
    """The answer (Markdown), each proposed file as full text with its base, and Claude's chat id to keep talking.
    put_back: files the agent changed in place, put back as they were and shown as proposals instead."""
    s = hub().connected(cluster)
    res = s.ssh.run(asks.fetch_command(id), timeout=120)
    if res.returncode != 0 or not res.stdout.strip():
        raise ValueError("That ask has no answer yet")
    try:
        r = asks.parse_result(id, res.stdout.strip())
    except (ValueError, OSError, EOFError) as e:
        raise ValueError(f"Could not read the answer: {e}") from e
    return {"id": r.id, "answer": r.answer, "chat_id": r.chat_id, "put_back": r.put_back, "state": r.state,
            "files": [asdict(f) for f in r.files]}


@method("code.ask_cancel")
def ask_cancel(cluster: str, id: str) -> dict:  # noqa: A002
    """Stop it. Files the agent touched are put back before it ends."""
    asks.check_id(id)
    with _lock:
        p = _pending.get(id)
    if p and p.cluster == cluster:
        p.cancelled = True
        if p.state in ("starting", "waiting_for_node"):
            p.state = "cancelled"
        return _status(p)
    st = _fetch(cluster, id)
    if not st:
        raise ValueError("That ask is gone")
    s = hub().connected(cluster)
    node = _node_of(s, id)
    s.ssh.run(tmux.on(node, asks.cancel_command(id)), timeout=30)
    return asdict(_fetch(cluster, id) or st)


def _node_of(s, ask_id: str) -> str:
    res = s.ssh.run(f'cat "$HOME"/{asks.ROOT}/{asks.check_id(ask_id)}/meta.json 2>/dev/null', timeout=20)
    try:
        return str(json.loads(res.stdout).get("node", ""))
    except ValueError:
        return ""
