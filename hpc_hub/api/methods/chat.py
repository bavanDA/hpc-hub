"""The Chat view of a Claude tab (agents/chat_view.py): the conversation read from Claude's own file, what waits on
you read from the screen, and answers sent as keys. Messages go in with terminals.send, like typing them."""

import time

from ...agents import chat_view
from ...terminals import tmux
from ..hub import hub
from ..server import method

MODE_TRIES = 6  # Shift+Tab presses at most when switching the permission mode
CYCLE = ("ask", "edits", "plan", "auto")  # Shift+Tab's order; auto (or bypass) only when Claude offers it
MODE_WAIT = 4  # reads of the footer after a press before the next one (a node over ssh draws later)


@method("chat.read")
def read(cluster: str, session: str, file: str = "", offset: int = -1, since: float = 0) -> dict:
    """The conversation from offset on (-1: the end of it). since: after /clear or /resume, follow a newer file
    in the same folder. {waiting: true} until Claude has written its file."""
    return chat_view.read(hub().connected(cluster).ssh, session, file, offset, since)


@method("chat.where")
def where(cluster: str, session: str) -> dict:
    """The chat of a Claude tab, also once its session (or its job) ended: {chat_id, folder}, so Continue starts
    claude --resume there (tools.agent_start)."""
    return chat_view.where(hub().connected(cluster).ssh, session)


@method("chat.screen")
def screen(cluster: str, session: str, node: str = "") -> dict:
    """What waits on you: {busy, mode, ask: {question, detail, options: [{key, label}], permission}}."""
    return chat_view.screen(hub().connected(cluster).ssh, session, node)


@method("chat.send")
def send(cluster: str, session: str, text: str, node: str = "") -> dict:
    """Your message to Claude, as one paste and Enter. What Claude has in its input box (a message it gave back
    when you stopped it, or one you went back to) is cleared first: the view showed it to you to edit, and your
    text replaces it. Refused, never lost, when the box isn't there: a question or a menu is open."""
    if not text.strip():
        raise ValueError("Nothing to send")
    s = hub().connected(cluster)
    ssh = s.ssh
    now = chat_view.screen(ssh, session, node)
    if now.get("gone"):
        raise RuntimeError("This Claude session has ended")
    if not now.get("box"):
        if now.get("ask"):
            raise RuntimeError("Claude is asking something: answer it first, then send your message")
        if not now.get("ready"):
            hub().log(s, f"Chat: no input box on Claude's screen ({now.get('shape', '')})")
            raise RuntimeError("Claude is still starting or has a menu open. Send once its input box shows, or "
                               "finish the menu in the terminal")
    tmux.run(ssh, chat_view.send_command(session, text, now.get("draft", ""), node))
    return {"replaced": bool(now.get("draft"))}


@method("chat.stop")
def stop(cluster: str, session: str, node: str = "") -> dict:
    """Stop Claude (Esc) while it works. Nothing when it has already stopped: a second Esc on an idle Claude opens
    its rewind menu, which the view can't show (and a message typed then would go into that menu)."""
    ssh = hub().connected(cluster).ssh
    now = chat_view.screen(ssh, session, node)
    if now.get("busy"):
        tmux.run(ssh, chat_view.key_command(session, "escape", node))
        return {"stopped": True}
    return {"stopped": False}


@method("chat.key")
def key(cluster: str, session: str, key: str, node: str = "") -> None:
    """Press an answer's number, escape, enter, or mode (Shift+Tab) in the session."""
    tmux.run(hub().connected(cluster).ssh, chat_view.key_command(session, key, node))


@method("chat.mode", slow=True)
def mode(cluster: str, session: str, mode: str, node: str = "") -> dict:
    """Switch Claude's permission mode (ask, edits, plan, auto) as Shift+Tab does, checking the footer after each
    press. Some modes exist only when Claude was started with them; then it says so."""
    if mode not in ("ask", "edits", "plan", "auto"):
        raise ValueError(f"Unknown mode {mode}")
    ssh = hub().connected(cluster).ssh
    now = chat_view.screen(ssh, session, node)
    if not now.get("ready", True) and not now.get("ask") and not now.get("gone"):
        raise RuntimeError("Claude is still starting. Switch once its input box shows")
    ahead = forward(now.get("mode", ""), mode)
    if ahead > 1 and not now.get("ask") and not now.get("gone"):  # one trip over ssh for every press needed
        before = now.get("mode")
        tmux.run(ssh, chat_view.key_command(session, f"mode:{ahead}", node))
        now = _changed(ssh, session, node, before)
    for _ in range(MODE_TRIES):
        if now.get("mode") == mode:
            return now
        if now.get("ask") or now.get("gone"):
            raise RuntimeError("Answer Claude's question first")
        before = now.get("mode")
        tmux.run(ssh, chat_view.key_command(session, "mode", node))
        now = _changed(ssh, session, node, before)
    if now.get("mode") == mode:
        return now
    raise RuntimeError("Claude didn't offer that mode. Some modes are only there when Claude starts with them")


def forward(now: str, want: str) -> int:
    """Presses from now to want that never wrap past the end of the cycle (auto may not be there): 0 when it
    would wrap, or either mode is unknown. Those go one press at a time."""
    if now not in CYCLE or want not in CYCLE:
        return 0
    ahead = CYCLE.index(want) - CYCLE.index(now)
    return ahead if ahead > 0 else 0


def _changed(ssh, session: str, node: str, before) -> dict:
    """The screen once the footer moved on from before (or a question came up), read a few times: pressing again
    too soon would skip a mode."""
    now = {}
    for _ in range(MODE_WAIT):
        time.sleep(0.35)
        now = chat_view.screen(ssh, session, node)
        if now.get("mode") != before or now.get("ask") or now.get("gone"):
            break
    return now
