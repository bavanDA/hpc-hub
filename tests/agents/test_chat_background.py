"""Run in background (Ctrl+B) from the Chat view (2026-11-23, owner: "you don't have ctrl b in the chat ... like
maybe run in background button?"). claude-shell-running.txt is a real Claude Code 2.1 screen while a shell command
runs, its folder made up: inside tmux, Claude says to press Ctrl+B twice (tmux takes the first); sent straight to
the pane once is enough (tried on that Claude: the command went on in the background)."""

from pathlib import Path

import pytest

from hpc_hub.agents import chat_view
from hpc_hub.api.methods import chat

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
RUNNING = (HERE / "screens" / "claude-shell-running.txt").read_text(encoding="utf-8")
SESSION = "hpchub-claude-1659999-ab12cd34"


def test_a_running_shell_command_can_go_to_the_background():
    got = chat_view.parse_screen(RUNNING)
    assert got["busy"] and got["background"] and got["box"]


def test_not_offered_otherwise():
    for name in ("claude-typed.txt", "claude-named-box.txt", "claude-ask.txt", "claude-hint.txt"):
        assert not chat_view.parse_screen((HERE / "screens" / name).read_text(encoding="utf-8"))["background"]
    # the words without Claude working: an old line in the answer
    idle = RUNNING.replace("esc to interrupt", "for shortcuts")
    assert not chat_view.parse_screen(idle)["background"]


def test_the_key_is_one_ctrl_b():
    cmd = chat_view.key_command(SESSION, "background")
    assert cmd.endswith(" C-b") and cmd.count("C-b") == 1
    on_node = chat_view.key_command(SESSION, "background", node="n0042")
    assert on_node.startswith("ssh") and "n0042" in on_node and "C-b" in on_node


class Fake:
    def __init__(self, screen: str):
        self.screen, self.ran = screen, []

    def on_login(self, line, timeout=20):
        return type("R", (), {"returncode": 0, "stdout": self.screen, "stderr": ""})()


@pytest.fixture
def session(monkeypatch):
    fake = Fake(RUNNING)
    hub = type("H", (), {"connected": lambda self, c: type("S", (), {"ssh": fake})()})()
    monkeypatch.setattr(chat, "hub", lambda: hub)
    monkeypatch.setattr(chat.tmux, "run", lambda ssh, line: fake.ran.append(line))
    return fake


def test_chat_background_presses_ctrl_b_while_offered(session):
    assert chat.background("wulver", SESSION, node="n0042") == {"moved": True}
    (line,) = session.ran
    assert "C-b" in line and "n0042" in line


def test_chat_background_presses_nothing_otherwise(session):
    session.screen = (HERE / "screens" / "claude-typed.txt").read_text(encoding="utf-8")
    assert chat.background("wulver", SESSION) == {"moved": False} and session.ran == []


def test_the_chat_view_has_the_button_and_the_key():
    view = (ROOT / "app" / "src" / "components" / "chat" / "ChatView.tsx").read_text()
    hook = (ROOT / "app" / "src" / "components" / "chat" / "useChat.ts").read_text()
    assert "call('chat.background'" in hook
    assert "{screen.background && (" in view and ">Run in background</button>" in view
    assert "e.key.toLowerCase() === 'b'" in view and "if (!shown || !canBackground) return" in view
