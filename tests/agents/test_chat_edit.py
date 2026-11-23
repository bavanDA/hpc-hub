"""Stopping Claude and editing a message from the Chat view (2026-11-22 report: "when she wants to cancel and edit
her message she hits a bug and some of her messages don't show up in the chat").

Seen on a real Claude Code (2.1): Stop before Claude answers gives the message back into Claude's input box, unsent,
and so does going back to an earlier one (Esc Esc). The view typed the next message after it, so the two went to
Claude run together, and the view showed the stopped message as sent. The screens and the conversation file here
are from that run, with made-up paths."""

import json
from pathlib import Path

import pytest

from hpc_hub.agents import chat_view
from hpc_hub.api.methods import chat

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
HANDED_BACK = (HERE / "screens" / "claude-handed-back.txt").read_text(encoding="utf-8")
HINT = (HERE / "screens" / "claude-hint.txt").read_text(encoding="utf-8")
ASKING = (HERE / "screens" / "claude-ask.txt").read_text(encoding="utf-8")
LINES = [json.loads(ln) for ln in (HERE / "chats" / "stop-and-rewind.jsonl").read_text().splitlines()]
RULE = "─" * 100
STATUS = "  ⏵⏵ auto mode on (shift+tab to cycle)"


def box(*rows: str) -> str:
    return "\n".join(["● Done.", RULE, *rows, RULE, STATUS])


# -- what is in Claude's input box -----------------------------------------------------------------------------

def test_a_message_claude_gave_back_is_read_from_its_box():
    got = chat_view.parse_screen(HANDED_BACK)
    assert got["box"] and got["draft"] == "Write a long poem about snow.\nMake every stanza rhyme."


def test_claudes_dim_hint_in_an_empty_box_is_not_a_draft():
    got = chat_view.parse_screen(HINT)
    assert got["box"] and got["draft"] == ""
    # the same words typed (no dim style) are yours
    typed = HINT.replace("\x1b[2mTry", "Try")
    assert chat_view.parse_screen(typed)["draft"] == 'Try "refactor <filepath>"'


@pytest.mark.parametrize("rows, draft", [
    (["❯ "], ""),
    (["> "], ""),
    (['❯ Try "how does <filepath> work?"'], ""),  # a plain capture: the hint's words
    (["❯ Press up to edit queued messages"], ""),
    (["❯ fix the plot"], "fix the plot"),
    (["> fix the plot", "  and the axis labels"], "fix the plot\nand the axis labels"),
])
def test_drafts_in_a_plain_box(rows, draft):
    assert chat_view.parse_screen(box(*rows))["draft"] == draft


def test_a_long_line_claude_wrapped_reads_as_one_line():
    first = "❯ " + "word " * 19 + "end"  # as wide as the box, nearly
    got = chat_view.parse_screen(box(first, "  of the sentence"))["draft"]
    assert "\n" not in got and got.endswith("end of the sentence")


def test_no_box_while_a_question_or_menu_takes_its_place():
    got = chat_view.parse_screen(ASKING)
    assert got["ask"] and not got["box"] and got["draft"] == ""
    rewind = "\n".join(["  Rewind", "  Restore the code and/or conversation to the point before…", "    fix the plot",
                        "    No code changes", "  ❯ (current)", "  Enter to continue · Esc to cancel"])
    assert not chat_view.parse_screen(rewind)["box"]


def test_the_screen_is_read_with_its_colours():
    assert "capture-pane -p -e" in chat_view.screen_command("hpchub-claude-1-ab12cd34")


# -- sending over a draft --------------------------------------------------------------------------------------

def test_clearing_never_presses_escape_or_ctrl_c():
    keys = chat_view.clear_keys("a\nb\nc").split()
    assert "Escape" not in keys and "C-c" not in keys
    # both ways from wherever the cursor is: the lines below it, then those above
    assert keys.count("Delete") == keys.count("BSpace") >= 4
    assert keys.index("Delete") < keys.index("BSpace")
    assert chat_view.clear_keys("x\n" * 500).split().count("Delete") == chat_view.CLEAR_MAX  # a bounded command


def test_a_draft_is_cleared_before_the_message_is_pasted():
    cmd = chat_view.send_command("hpchub-claude-1-ab12cd34", "What is 3+3?", draft="Also: what is 2+2?")
    assert cmd.index("C-u") < cmd.index("paste-buffer") < cmd.index("Enter")
    plain = chat_view.send_command("hpchub-claude-1-ab12cd34", "What is 3+3?")
    assert "C-u" not in plain and "paste-buffer" in plain
    on_node = chat_view.send_command("hpchub-claude-1-ab12cd34", "hi", draft="x", node="n0042")
    assert on_node.startswith("ssh") and "n0042" in on_node and "C-u" in on_node


class Fake:
    """A session whose screen is set by the test; records the commands sent to it."""

    def __init__(self, screen: str):
        self.screen, self.ran = screen, []

    def on_login(self, line, timeout=20):
        return type("R", (), {"returncode": 0, "stdout": self.screen, "stderr": ""})()


@pytest.fixture
def session(monkeypatch):
    fake = Fake(HANDED_BACK)
    hub = type("H", (), {"connected": lambda self, c: type("S", (), {"ssh": fake})()})()
    monkeypatch.setattr(chat, "hub", lambda: hub)
    monkeypatch.setattr(chat.tmux, "run", lambda ssh, line: fake.ran.append(line))
    return fake


def test_chat_send_replaces_what_claude_gave_back(session):
    assert chat.send("demo", "hpchub-claude-1-ab12cd34", "Just say OK.") == {"replaced": True}
    (line,) = session.ran
    assert "C-u" in line and "paste-buffer" in line


def test_chat_send_types_straight_into_an_empty_box(session):
    session.screen = HINT
    assert chat.send("demo", "hpchub-claude-1-ab12cd34", "hi") == {"replaced": False}
    assert "C-u" not in session.ran[0]


def test_chat_send_refuses_when_no_box_is_there_and_types_nothing(session):
    session.screen = ASKING
    with pytest.raises(RuntimeError, match="answer it first"):
        chat.send("demo", "hpchub-claude-1-ab12cd34", "hi")
    session.screen = "  Rewind\n    fix the plot\n  ❯ (current)\n  Enter to continue · Esc to cancel"
    with pytest.raises(RuntimeError, match="menu"):
        chat.send("demo", "hpchub-claude-1-ab12cd34", "hi")
    assert session.ran == []


def test_stop_presses_escape_only_while_claude_works(session):
    session.screen = HANDED_BACK  # idle: a second Esc would open the rewind menu
    assert chat.stop("demo", "hpchub-claude-1-ab12cd34") == {"stopped": False} and session.ran == []
    session.screen = box("❯ ").replace(STATUS, STATUS + " · esc to interrupt")
    assert chat.stop("demo", "hpchub-claude-1-ab12cd34") == {"stopped": True}
    assert session.ran[0].endswith("Escape")


def test_the_chat_view_sends_and_stops_through_these():
    hook = (ROOT / "app" / "src" / "components" / "chat" / "useChat.ts").read_text()
    view = (ROOT / "app" / "src" / "components" / "chat" / "ChatView.tsx").read_text()
    assert "call('chat.send'" in hook and "terminals.send" not in hook and "call('chat.stop'" in hook
    assert "stop().catch(fail)" in view and "key('escape')" not in view


# -- the conversation as it stands -----------------------------------------------------------------------------

def test_claudes_interrupted_line_is_a_note_not_your_message():
    for said in ("[Request interrupted by user]", "[Request interrupted by user for tool use]"):
        line = {"type": "user", "uuid": "u1", "message": {"content": [{"type": "text", "text": said}]}}
        got = chat_view.events([line])
        assert got == [{"kind": "note", "id": "u1", "text": "Stopped", "line": "u1"}]


def test_every_item_names_its_line_and_every_line_its_parent():
    events, links = chat_view.events(LINES), dict(chat_view.links(LINES))
    assert all(e["line"] in links for e in events)
    # the rewind: the edited message hangs from the same earlier line as the one it went back on
    first = next(e for e in events if e.get("text") == "Also: what is 2+2?")
    edited = next(e for e in events if e.get("text") == "Also: what is 2+2?What is 3+3?")
    assert links[first["line"]] == links[edited["line"]]


def test_links_are_each_lines_parent_only():
    got = chat_view.links([{"type": "system", "uuid": "c1", "parentUuid": None, "logicalParentUuid": "u9"},
                           {"type": "user", "uuid": "u10", "parentUuid": "c1"}, {"type": "summary"}])
    assert got == [["c1", ""], ["u10", "c1"]]


# -- a message sent while Claude works (2026-11-22: "she missed one chat message") -----------------------------

def queued(uid: str, prompt, parent: str = "a1") -> dict:
    return {"type": "attachment", "uuid": uid, "parentUuid": parent, "attachment": {"type": "queued_command",
                                                                                   "prompt": prompt}}


def test_a_message_given_to_claude_between_two_steps_shows():
    """Claude writes a message you send while it works only as a queued_command attachment: it never showed."""
    tool = {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "pytest"}}
    lines = [{"type": "user", "uuid": "u1", "message": {"content": "run the tests"}},
             {"type": "assistant", "uuid": "a1", "parentUuid": "u1", "message": {"content": [tool]}},
             queued("q1", "also check the plots"),
             queued("q2", [{"type": "text", "text": "[Image #2] and this one"}, {"type": "image", "source": {}}], "q1")]
    got = [(e["kind"], e.get("text")) for e in chat_view.events(lines) if e["kind"] == "user"]
    assert got == [("user", "run the tests"), ("user", "also check the plots"), ("user", "[Image #2] and this one")]


def test_other_attachments_and_claudes_own_reminders_stay_out():
    lines = [queued("q1", "<system-reminder>x</system-reminder>"), queued("q2", ""),
             {"type": "attachment", "uuid": "e1", "attachment": {"type": "environment", "text": "hi"}}]
    assert chat_view.events(lines) == []


def test_a_queued_message_written_again_as_a_message_shows_once():
    lines = [queued("q1", "also check the plots"),
             {"type": "user", "uuid": "u2", "parentUuid": "q1", "message": {"content": "also check the plots"}}]
    assert [e["text"] for e in chat_view.events(lines)] == ["also check the plots"]
    # the same words sent again after Claude answered are two messages
    lines.insert(1, {"type": "assistant", "uuid": "a2", "message": {"content": [{"type": "text", "text": "Done."}]}})
    assert [e["text"] for e in chat_view.events(lines)] == ["also check the plots", "Done.", "also check the plots"]


def test_the_views_fixture_is_this_files_reading():
    """app/src/components/chat/fixtures/stop-and-rewind.json: what the view's tests take as chat.read's answer."""
    fixture = json.loads((ROOT / "app/src/components/chat/fixtures/stop-and-rewind.json").read_text())
    assert fixture == {"events": chat_view.events(LINES), "links": chat_view.links(LINES)}
