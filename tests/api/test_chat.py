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


class Slow(Fake):
    """A footer drawn late (a node over ssh): the first read after a press still shows the old mode."""
    def __init__(self, cycle):
        super().__init__(cycle)
        self.shown, self.reads = 0, 0

    def screen(self, ssh, session, node=""):
        self.reads += 1
        out = {"busy": False, "mode": self.cycle[self.shown % len(self.cycle)], "ask": None}
        self.shown = self.at  # the press shows up from the next read on
        return out


@pytest.fixture
def slow(monkeypatch, fake):
    def make(cycle):
        fake(cycle)
        f = Slow(cycle)
        monkeypatch.setattr(chat.chat_view, "screen", f.screen)
        monkeypatch.setattr(chat.tmux, "run", f.press)
        return f
    return make


def test_a_late_footer_is_waited_for_not_pressed_past(slow):
    """2026-11-19 reports: pressing again before the footer changed skipped modes, and the switch gave up."""
    f = slow(["ask", "edits", "plan", "auto"])
    assert chat.mode("wulver", "s", "auto", "n0042")["mode"] == "auto"
    assert len(f.keys) == 3  # one press per mode, none skipped


def test_back_to_ask_from_auto_goes_round_once(slow):
    f = slow(["auto", "ask", "edits", "plan"])
    assert chat.mode("wulver", "s", "ask")["mode"] == "ask"
    assert len(f.keys) == 1


def test_a_question_that_appears_after_a_press_stops_the_presses(monkeypatch, fake):
    f = fake(["ask", "edits"])
    reads = iter([{"mode": "ask", "ask": None}, {"mode": "ask", "ask": {"question": "Do you want?"}}])
    monkeypatch.setattr(chat.chat_view, "screen", lambda *a, **k: next(reads))
    with pytest.raises(RuntimeError, match="Answer Claude's question first"):
        chat.mode("wulver", "s", "plan")
    assert len(f.keys) == 1
