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
    # a rule and nothing else
    "\n".join(["Loading…", RULE]),
])
def test_what_is_not_an_input_box(screen):
    got = chat_view.parse_screen(screen)
    assert not got["box"] and not got["ready"]


def test_claudes_background_tasks_listed_under_the_box():
    """Claude lists the tasks and agents it runs in the background under its box: more rows than its footer."""
    tasks = [f"  ⎿ bash: python bench.py --scale {n}  (running {n}m)" for n in range(1, 9)]
    screen = "\n".join(["● Still running the benchmarks.", RULE, "❯ ", RULE, "  ⏸ manual mode on", *tasks])
    got = chat_view.parse_screen(screen)
    assert got["ready"] and got["box"] and got["draft"] == ""
    typed = "\n".join(["● Still running.", RULE, "❯ are you still working", RULE, *tasks])
    assert chat_view.parse_screen(typed)["draft"] == "are you still working"


def test_a_box_far_above_the_bottom_is_not_the_box():
    screen = "\n".join([RULE, "❯ old", RULE, *(f"line {i}" for i in range(chat_view.BOX_REACH + 5))])
    assert not chat_view.parse_screen(screen)["box"]


def test_the_lowest_box_counts():
    screen = "\n".join([RULE, "❯ quoted in an answer", RULE, "● Done.", RULE, "❯ mine", RULE])
    assert chat_view.parse_screen(screen)["draft"] == "mine"


def test_the_layout_logged_has_counts_never_words():
    screen = "\n".join(["● Secret results: 42", "Loading your project secrets…", RULE])
    got = chat_view.shape(screen)
    assert "Secret" not in got and "secrets" not in got and "3 rows" in got and "rules at [-1]" in got


def test_a_refusal_logs_the_layout(session):
    session.screen = "\n".join(["╭" + RULE + "╮", "│ ✻ Welcome to Claude Code!" + " " * 73 + "│", "╰" + RULE + "╯"])
    with pytest.raises(RuntimeError, match="still starting"):
        chat.send("wulver", SESSION, "hi")
    (line,) = session.logged
    assert line.startswith("Chat: no input box on Claude's screen (3 rows") and "Welcome" not in line


def test_a_question_still_comes_before_the_box():
    got = chat_view.parse_screen((SCREENS / "claude-ask.txt").read_text(encoding="utf-8"))
    assert got["ask"] and not got["box"]
    trust = chat_view.parse_screen((SCREENS / "claude-trust.txt").read_text(encoding="utf-8"))
    assert trust["ask"] and not trust["box"]


class Fake:
    def __init__(self, screen: str):
        self.screen, self.ran, self.logged = screen, [], []

    def on_login(self, line, timeout=20):
        return type("R", (), {"returncode": 0, "stdout": self.screen, "stderr": ""})()


@pytest.fixture
def session(monkeypatch):
    fake = Fake(without_footer(TYPED))
    hub = type("H", (), {"connected": lambda self, c: type("S", (), {"ssh": fake})(),
                         "log": lambda self, s, line: fake.logged.append(line)})()
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


# -- 2026-11-23, the owner's laptop (Linux, fix 40): a recent Claude names the session in the box's top edge, and
# lists its agents and notices under the box. claude-named-box.txt is that screen, its words made up. ------------

NAMED = (SCREENS / "claude-named-box.txt").read_text(encoding="utf-8")


def test_a_box_whose_top_edge_has_the_sessions_name():
    got = chat_view.parse_screen(NAMED)
    assert got["ready"] and got["box"] and not got["ask"] and not got["busy"]
    assert got["draft"] == ""  # Claude's suggestion, dim: not something typed
    assert got["mode"] == "auto"


def test_the_named_box_with_something_typed():
    typed = NAMED.replace("❯ \x1b[2mwhen", "❯ when", 1)
    assert "❯ when" in typed
    assert chat_view.parse_screen(typed)["draft"].startswith("when")


@pytest.mark.parametrize("row, edge", [
    ("─" * 53 + " Claude · plots ─", True),
    ("─" * 40 + " a much longer session name, still one line ──", True),
    ("─" * 100, True),
    ("╰" + "─" * 98 + "╯", True),
    ("── a heading ──", False),  # a short rule in an answer
    ("─" * 30 + " " + "x" * 80 + " ─", False),  # words, not a name
    ("● Done ───────────────────", False),
])
def test_what_counts_as_an_edge(row, edge):
    assert bool(chat_view.EDGE.match(row)) is edge


def test_the_mode_is_read_under_the_box_not_from_the_last_rows():
    for words, mode in (("⏸ plan mode on", "plan"), ("⏵⏵ accept edits on", "edits"), ("⏸ manual mode on", "ask")):
        screen = NAMED.replace("auto\x1b[39m \x1b[93mmode", "x\x1b[39m \x1b[93mx", 1)
        lines = screen.split("\n")
        k = next(i for i, ln in enumerate(lines) if "x\x1b[39m \x1b[93mx" in ln)
        lines[k] = "  " + words + " · 1 shell"
        assert chat_view.parse_screen("\n".join(lines))["mode"] == mode


def test_chat_send_goes_into_the_named_box(session):
    session.screen = NAMED
    assert chat.send("wulver", SESSION, "are you still working or not", node="n0042") == {"replaced": False}
    assert len(session.ran) == 1 and session.logged == []
