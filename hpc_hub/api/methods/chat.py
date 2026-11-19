"""The Chat view of a Claude tab (agents/chat_view.py): the conversation read from Claude's own file, what waits on
you read from the screen, and answers sent as keys. Messages go in with terminals.send, like typing them."""

import time

from ...agents import chat_view
from ...terminals import tmux
from ..hub import hub
from ..server import method

MODE_TRIES = 6  # Shift+Tab presses at most when switching the permission mode
MODE_WAIT = 4  # reads of the footer after a press before the next one (a node over ssh draws later)


@method("chat.read")
def read(cluster: str, session: str, file: str = "", offset: int = -1, since: float = 0) -> dict:
    """The conversation from offset on (-1: the end of it). since: after /clear or /resume, follow a newer file
    in the same folder. {waiting: true} until Claude has written its file."""
    return chat_view.read(hub().connected(cluster).ssh, session, file, offset, since)


@method("chat.screen")
def screen(cluster: str, session: str, node: str = "") -> dict:
    """What waits on you: {busy, mode, ask: {question, detail, options: [{key, label}], permission}}."""
    return chat_view.screen(hub().connected(cluster).ssh, session, node)


@method("chat.key")
def key(cluster: str, session: str, key: str, node: str = "") -> None:
    """Press an answer's number, escape, enter, or mode (Shift+Tab) in the session."""
    tmux.run(hub().connected(cluster).ssh, chat_view.key_command(session, key, node))


@method("chat.mode")
def mode(cluster: str, session: str, mode: str, node: str = "") -> dict:
    """Switch Claude's permission mode (ask, edits, plan, auto) as Shift+Tab does, checking the footer after each
    press. Some modes exist only when Claude was started with them; then it says so."""
    if mode not in ("ask", "edits", "plan", "auto"):
        raise ValueError(f"Unknown mode {mode}")
    ssh = hub().connected(cluster).ssh
    now = chat_view.screen(ssh, session, node)
    for _ in range(MODE_TRIES):
        if now.get("mode") == mode:
            return now
        if now.get("ask") or now.get("gone"):
            raise RuntimeError("Answer Claude's question first")
        before = now.get("mode")
        tmux.run(ssh, chat_view.key_command(session, "mode", node))
        for _ in range(MODE_WAIT):  # wait for the footer to change: pressing again too soon skips a mode
            time.sleep(0.35)
            now = chat_view.screen(ssh, session, node)
            if now.get("mode") != before or now.get("ask") or now.get("gone"):
                break
    if now.get("mode") == mode:
        return now
    raise RuntimeError("Claude didn't offer that mode. Some modes are only there when Claude starts with them")
