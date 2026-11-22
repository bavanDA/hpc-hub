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
        self.at += line.count("BTab")  # "mode:2" sends two presses in one command


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
    assert len(f.keys) == 1 and f.keys[0].endswith("BTab BTab'")  # both presses in one trip


def test_a_mode_claude_does_not_offer_is_said_not_faked(fake):
    f = fake(["ask", "edits", "plan"])
    with pytest.raises(RuntimeError, match="didn't offer that mode"):
        chat.mode("wulver", "s", "auto")
    assert len(f.keys) == 1 + chat.MODE_TRIES  # three at once, then one at a time, then it says so


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
    assert len(f.keys) == 1 and f.at == 3  # three presses in one trip, none past it


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



# 2026-11-20 report (Linux): switching modes was slow and still failed now and then; and while Claude was starting
# nothing said so. Each press used to be its own trip over ssh to the node.
def test_forward_never_wraps_past_the_end_of_the_cycle():
    assert chat.forward("ask", "plan") == 2 and chat.forward("ask", "auto") == 3 and chat.forward("edits", "plan") == 1
    assert chat.forward("auto", "ask") == 0  # wraps: auto may not be there, so one press at a time
    assert chat.forward("plan", "edits") == 0 and chat.forward("ask", "ask") == 0 and chat.forward("", "plan") == 0


def test_going_round_from_auto_back_to_edits(fake):
    f = fake(["auto", "ask", "edits", "plan"])
    assert chat.mode("wulver", "s", "edits")["mode"] == "edits"
    assert f.keys and all(k.endswith("BTab") and "BTab BTab" not in k for k in f.keys)  # one at a time
    assert len(f.keys) == 2


def test_claude_still_starting_says_so_and_presses_nothing(monkeypatch, fake):
    f = fake(["ask"])
    monkeypatch.setattr(chat.chat_view, "screen", lambda *a, **k: {"busy": False, "mode": "ask", "ask": None,
                                                                    "ready": False})
    with pytest.raises(RuntimeError, match="Claude is still starting"):
        chat.mode("wulver", "s", "plan")
    assert f.keys == []


def test_several_presses_are_one_tmux_command():
    from hpc_hub.agents import chat_view
    line = chat_view.key_command("hpchub-claude-1-3f2a9c1e", "mode:3")
    assert line.endswith("send-keys -t hpchub-claude-1-3f2a9c1e: BTab BTab BTab")
    assert chat_view.key_command("s", "mode:2", "n0042").endswith("BTab BTab'")  # on a node: inside its ssh line
    with pytest.raises(ValueError):
        chat_view.key_command("s", "mode:9")
