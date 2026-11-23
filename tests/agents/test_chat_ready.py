"""Claude's input box found with nothing under it (2026-11-23 report, Windows, 0.2.7-beta.62 fix 37: "Claude is
still starting or has a menu open" on sending, twice, an hour and a half after Claude started on its node).

The view knew the box only by the words Claude prints under it (its mode, "? for shortcuts"). Some Claudes print
nothing there once text is in the box, so a box with a draft read as Claude still starting. claude-typed.txt is a
real Claude Code 2.1 screen with a draft in its box, its folder made up."""

from pathlib import Path

import pytest

from hpc_hub.agents import chat_view
from hpc_hub.api.methods import chat

SCREENS = Path(__file__).parent / "screens"
TYPED = (SCREENS / "claude-typed.txt").read_text(encoding="utf-8")
RULE = "─" * 100
SESSION = "hpchub-claude-1659999-ab12cd34"


def without_footer(screen: str) -> str:
    """The same screen with nothing under the box, as those Claudes draw it."""
    lines = screen.rstrip("\n").split("\n")
    while lines and not chat_view.EDGE.match(chat_view.TERMINAL_CODES.sub("", lines[-1])):
        lines.pop()
    return "\n".join(lines) + "\n"


def test_a_real_box_with_a_draft_and_its_mode_under_it():
    got = chat_view.parse_screen(TYPED)
    assert got["ready"] and got["box"] and got["draft"] == "fix the plot axis"
    assert got["mode"] == "ask"  # "manual mode on": Claude's newer name for asking first


def test_the_same_box_with_nothing_under_it_is_still_the_box():
    bare = without_footer(TYPED)
    assert "manual mode" not in bare
    got = chat_view.parse_screen(bare)
    assert got["ready"] and got["box"] and got["draft"] == "fix the plot axis" and not got["busy"]


@pytest.mark.parametrize("under", ["", "                                              ◯ IDE disconnected",
                                   "  Context left until auto-compact: 8%", "\n\n"])
def test_a_box_with_other_words_or_blank_rows_under_it(under):
    screen = "\n".join(["● Done.", RULE, "❯ make it blue", RULE, under])
    got = chat_view.parse_screen(screen)
    assert got["ready"] and got["box"] and got["draft"] == "make it blue"


def test_an_empty_box_with_nothing_under_it():
    got = chat_view.parse_screen("\n".join(["● Done.", RULE, "❯ ", RULE]))
    assert got["ready"] and got["box"] and got["draft"] == ""


def test_the_rounded_box_of_older_claudes():
    screen = "\n".join(["● Done.", "╭" + RULE + "╮", "│ > make it blue" + " " * 84 + "│", "╰" + RULE + "╯"])
    assert chat_view.parse_screen(screen)["ready"] and chat_view.parse_screen(screen)["box"]


@pytest.mark.parametrize("screen", [
    # the welcome box alone: Claude is still starting
    "\n".join(["╭" + RULE + "╮", "│ ✻ Welcome to Claude Code!" + " " * 73 + "│", "╰" + RULE + "╯"]),
    # two rules around something that isn't the prompt
    "\n".join([RULE, " Bash command", "   ls -la", RULE]),
    # a menu under the box: typing would go into the menu
    "\n".join([RULE, "❯ /", RULE, *(f"  /command{i}   does thing {i}" for i in range(7))]),
    # a rule and nothing else
    "\n".join(["Loading…", RULE]),
])
def test_what_is_not_an_input_box(screen):
    got = chat_view.parse_screen(screen)
    assert not got["box"] and not got["ready"]


def test_a_question_still_comes_before_the_box():
    got = chat_view.parse_screen((SCREENS / "claude-ask.txt").read_text(encoding="utf-8"))
    assert got["ask"] and not got["box"]
    trust = chat_view.parse_screen((SCREENS / "claude-trust.txt").read_text(encoding="utf-8"))
    assert trust["ask"] and not trust["box"]


class Fake:
    def __init__(self, screen: str):
        self.screen, self.ran = screen, []

    def on_login(self, line, timeout=20):
        return type("R", (), {"returncode": 0, "stdout": self.screen, "stderr": ""})()


@pytest.fixture
def session(monkeypatch):
    fake = Fake(without_footer(TYPED))
    hub = type("H", (), {"connected": lambda self, c: type("S", (), {"ssh": fake})()})()
    monkeypatch.setattr(chat, "hub", lambda: hub)
    monkeypatch.setattr(chat.tmux, "run", lambda ssh, line: fake.ran.append(line))
    return fake


def test_chat_send_goes_in_and_replaces_the_draft(session):
    assert chat.send("wulver", SESSION, "Use a log scale.", node="n0042") == {"replaced": True}
    (line,) = session.ran
    assert "n0042" in line and "C-u" in line and "paste-buffer" in line


def test_chat_send_still_refuses_while_claude_starts(session):
    session.screen = "\n".join(["╭" + RULE + "╮", "│ ✻ Welcome to Claude Code!" + " " * 73 + "│", "╰" + RULE + "╯"])
    with pytest.raises(RuntimeError, match="still starting"):
        chat.send("wulver", SESSION, "hi")
    assert session.ran == []


def test_the_view_says_starting_only_from_ready():
    model = (Path(__file__).parents[2] / "app" / "src" / "components" / "chat" / "model.ts").read_text()
    assert "s.ready === false" in model
