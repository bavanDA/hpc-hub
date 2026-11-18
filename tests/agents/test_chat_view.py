"""The Chat view's reading (agents/chat_view.py): Claude's conversation file, a piece at a time, and what waits on
you from the screen. A made-up home and chat; the reader runs in bash as it would on the cluster."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from hpc_hub.agents import chat_view

SID = "3f2a9c1e-0000-4000-8000-000000000001"
pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="the reader runs on the cluster's Linux")


def line(**d) -> str:
    return json.dumps(d) + "\n"


USER = line(type="user", uuid="u1", cwd="/home/jdoe/proj", message={"role": "user", "content": "Why did k=80 fail?"})
TOOL = line(type="assistant", uuid="a1", message={"role": "assistant", "content": [
    {"type": "text", "text": "I'll look at the log."},
    {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "/home/jdoe/proj/logs/run.out"}}]})
RESULT = line(type="user", uuid="u2", message={"role": "user", "content": [
    {"type": "tool_result", "tool_use_id": "toolu_1", "content": "slurmstepd: error: oom_kill"}]})


@pytest.fixture
def home(tmp_path):
    folder = tmp_path / ".claude" / "projects" / "-home-jdoe-proj"
    folder.mkdir(parents=True)
    return tmp_path, folder


def run(home, **args) -> dict:
    cmd = chat_view.read_command(args.pop("tag", SID[:8]), **args)
    out = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, env={**os.environ, "HOME": str(home)})
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_the_tab_name_says_which_chat():
    assert chat_view.tag_of("hpchub-claude-1606417-3f2a9c1e") == "3f2a9c1e"
    assert chat_view.tag_of("hpchub-claude-3f2a9c1e") == "3f2a9c1e"
    assert chat_view.tag_of("hpchub-claude-123-142233") == ""  # started before HPC Hub chose the id
    assert chat_view.tag_of("hpchub-codex-123-3f2a9c1e") == ""


def test_it_reads_on_from_where_it_stopped_and_waits_for_a_whole_line(home):
    h, folder = home
    chat = folder / f"{SID}.jsonl"
    chat.write_text(USER + TOOL)
    first = run(h)
    assert first["file"] == f"~/.claude/projects/-home-jdoe-proj/{SID}.jsonl" and not first["trimmed"]
    assert [d["uuid"] for d in first["lines"]] == ["u1", "a1"]
    with open(chat, "a") as f:
        f.write(RESULT[:30])  # Claude is still writing this line
    assert run(h, file=first["file"], offset=first["offset"])["lines"] == []
    with open(chat, "a") as f:
        f.write(RESULT[30:])
    nxt = run(h, file=first["file"], offset=first["offset"])
    assert [d["uuid"] for d in nxt["lines"]] == ["u2"] and nxt["offset"] == chat.stat().st_size


def test_a_long_chat_shows_its_end_first(home, monkeypatch):
    h, folder = home
    monkeypatch.setattr(chat_view, "READ_MAX", 2000)
    (folder / f"{SID}.jsonl").write_text("".join(line(type="user", uuid=f"u{i}", message={"content": "x" * 60})
                                                 for i in range(100)))
    got = run(h)
    assert got["trimmed"] and got["lines"][-1]["uuid"] == "u99" and len(got["lines"]) < 100
    assert all(d["uuid"].startswith("u") for d in got["lines"])  # whole lines only


def test_huge_strings_are_cut(home, monkeypatch):
    h, folder = home
    monkeypatch.setattr(chat_view, "STRING_MAX", 50)
    (folder / f"{SID}.jsonl").write_text(line(type="user", uuid="u1", message={"content": "y" * 500}))
    text = run(h)["lines"][0]["message"]["content"]
    assert text.startswith("y" * 50) and "450 more characters" in text


def test_after_clear_it_follows_the_newer_chat_in_the_folder(home):
    h, folder = home
    (folder / f"{SID}.jsonl").write_text(USER)
    other = folder / "9b9b9b9b-0000-4000-8000-000000000002.jsonl"
    other.write_text(TOOL)
    got = run(h, file=f"~/.claude/projects/-home-jdoe-proj/{SID}.jsonl", offset=10, since=1)
    assert got["file"].endswith(other.name) and [d["uuid"] for d in got["lines"]] == ["a1"]


def test_only_claudes_own_chat_files(home):
    h, _ = home
    (h / "secret.jsonl").write_text(USER)
    assert run(h, file="~/secret.jsonl", tag="") == {"waiting": True}
    assert run(h, file="~/.claude/projects/../../secret.jsonl", tag="") == {"waiting": True}
    assert run(h, tag="deadbeef") == {"waiting": True}  # Claude hasn't written it yet


def test_the_view_gets_messages_tools_and_results():
    lines = [json.loads(x) for x in (USER, TOOL, RESULT)] + [
        {"type": "user", "uuid": "m", "isMeta": True, "message": {"content": "<system-reminder>x</system-reminder>"}},
        {"type": "user", "uuid": "c", "message": {"content": "<command-name>/model</command-name>\n"
                                                             "<command-args>opus</command-args>"}},
        {"type": "user", "uuid": "o", "message": {"content": "<local-command-stdout>Set model to \x1b[1mOpus\x1b[22m"
                                                             "</local-command-stdout>"}},
        {"type": "assistant", "uuid": "t", "message": {"content": [{"type": "thinking", "thinking": "hmm"}]}},
        {"type": "system", "uuid": "s", "subtype": "compact_boundary"},
    ]
    got = chat_view.events(lines)
    assert [(e["kind"], e.get("text", e.get("name"))) for e in got] == [
        ("user", "Why did k=80 fail?"), ("text", "I'll look at the log."), ("tool", "Read"),
        ("result", "slurmstepd: error: oom_kill"), ("command", "/model opus"), ("note", "Set model to Opus"),
        ("note", "The conversation was compacted")]
    tool = got[2]
    assert tool["id"] == "toolu_1" and got[3]["tool"] == "toolu_1" and not got[3]["error"]


PERMISSION = """\
● Bash(sbatch job.sh)
  ⎿  Running…

╭──────────────────────────────────────────────────────────╮
│ Bash command                                             │
│                                                          │
│   sbatch job.sh                                          │
│   Submit the resized job                                 │
│                                                          │
│ Do you want to proceed?                                  │
│ ❯ 1. Yes                                                 │
│   2. Yes, and don't ask again for sbatch commands in     │
│   /home/jdoe/proj                                        │
│   3. No, and tell Claude what to do differently (esc)    │
╰──────────────────────────────────────────────────────────╯
"""


def test_a_permission_question_is_read_with_its_own_choices():
    got = chat_view.parse_screen(PERMISSION)
    ask = got["ask"]
    assert ask["question"] == "Do you want to proceed?" and ask["permission"]
    assert [o["key"] for o in ask["options"]] == ["1", "2", "3"]
    assert ask["options"][0]["label"] == "Yes" and ask["options"][2]["label"].startswith("No, and tell Claude")
    assert ask["options"][1]["label"] == "Yes, and don't ask again for sbatch commands in /home/jdoe/proj"
    assert "sbatch job.sh" in ask["detail"]
    assert not got["busy"]


def test_working_and_the_mode_come_from_the_footer():
    working = "● Reading files…\n\n> \n  ⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt\n"
    got = chat_view.parse_screen(working)
    assert got == {"busy": True, "mode": "edits", "ask": None}
    assert chat_view.parse_screen("> \n  ⏸ plan mode on (shift+tab to cycle)\n")["mode"] == "plan"
    assert chat_view.parse_screen("> \n  ? for shortcuts\n")["mode"] == "ask"
    # a numbered list in Claude's answer is not a menu: nothing is marked as picked
    assert chat_view.parse_screen("Steps:\n1. Build\n2. Test\n\n> \n")["ask"] is None


def test_only_known_keys_are_sent():
    assert chat_view.key_command("hpchub-claude-1-3f2a9c1e", "2", "n0042").endswith(
        "'tmux send-keys -t hpchub-claude-1-3f2a9c1e: 2'")
    assert "BTab" in chat_view.key_command("s", "mode")
    with pytest.raises(ValueError):
        chat_view.key_command("s", "C-c")


# -- screens captured from a real Claude Code (v2.1), paths made up ----------------------------------------

SCREENS = Path(__file__).parent / "screens"


def test_a_real_permission_question_with_its_four_choices():
    r = chat_view.parse_screen((SCREENS / "claude-ask.txt").read_text())
    ask = r["ask"]
    assert ask["question"] == "Do you want to proceed?" and ask["permission"]
    assert [o["key"] for o in ask["options"]] == ["1", "2", "3", "4"]
    assert ask["options"][0]["label"] == "Yes" and ask["options"][3]["label"] == "No"
    assert ask["options"][1]["label"].endswith("from this project")  # a choice that wraps stays one choice
    assert "printf 'hi" in ask["detail"] and "╌" not in ask["detail"]  # the command, not the dividers
    assert r["mode"] == "ask" and not r["busy"]


def test_a_real_auto_mode_footer():
    r = chat_view.parse_screen((SCREENS / "claude-auto.txt").read_text())
    assert r["mode"] == "auto" and r["ask"] is None  # your own message echoed with ❯ is no menu


def test_a_real_menu_without_numbers_is_answered_with_arrows():
    r = chat_view.parse_screen((SCREENS / "claude-trust.txt").read_text())
    ask = r["ask"]
    assert ask is not None and "trust" in ask["question"]
    assert ask["options"] == [{"key": "move:+0", "label": "No, exit"},
                              {"key": "move:+1", "label": "Yes, I trust this folder"}]
    assert chat_view.key_command("hpchub-claude-1-3f2a9c1e", "move:+1").endswith("Down Enter")
    assert chat_view.key_command("hpchub-claude-1-3f2a9c1e", "move:+0").endswith(" Enter")
    with pytest.raises(ValueError):
        chat_view.key_command("hpchub-claude-1-3f2a9c1e", "move:+12; rm")


def test_a_real_model_switch_asks_first():
    ask = chat_view.parse_screen((SCREENS / "claude-model.txt").read_text())["ask"]
    assert ask["question"] == "Switch model?" and not ask["permission"]
    assert [o["label"] for o in ask["options"]] == ["Yes, switch to Sonnet 5.5", "No, go back"]
