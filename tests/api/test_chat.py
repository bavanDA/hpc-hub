"""chat.mode: Shift+Tab until Claude's footer shows the mode, and an honest answer when it never does."""

import pytest

from hpc_hub.api.methods import chat


class Fake:
    def __init__(self, cycle):
        self.cycle, self.at, self.keys = cycle, 0, []

    def screen(self, ssh, session, node=""):
        return {"busy": False, "mode": self.cycle[self.at % len(self.cycle)], "ask": None}

    def press(self, ssh, line):
        self.keys.append(line)
        self.at += 1


@pytest.fixture
def fake(monkeypatch):
    def make(cycle):
        f = Fake(cycle)
        monkeypatch.setattr(chat.chat_view, "screen", f.screen)
        monkeypatch.setattr(chat.tmux, "run", f.press)
        monkeypatch.setattr(chat.time, "sleep", lambda s: None)
        monkeypatch.setattr(chat, "hub", lambda: type("H", (), {"connected": lambda self, c: type("S", (), {
            "ssh": None})()})())
        return f
    return make


def test_it_presses_until_the_footer_shows_the_mode(fake):
    f = fake(["ask", "edits", "plan"])
    assert chat.mode("wulver", "hpchub-claude-1-3f2a9c1e", "plan", "n0042")["mode"] == "plan"
    assert len(f.keys) == 2 and all("BTab" in k for k in f.keys)


def test_a_mode_claude_does_not_offer_is_said_not_faked(fake):
    f = fake(["ask", "edits", "plan"])
    with pytest.raises(RuntimeError, match="didn't offer that mode"):
        chat.mode("wulver", "s", "auto")
    assert len(f.keys) == chat.MODE_TRIES


def test_already_there_presses_nothing(fake):
    f = fake(["edits"])
    chat.mode("wulver", "s", "edits")
    assert f.keys == []
