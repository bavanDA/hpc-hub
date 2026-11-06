"""The agent's help in a paper's History: the choice, prompts, reading answers back, and run.sh with a stand-in
agent (no real agent runs). jdoe and asmith are made up."""

import json
import os
import stat
import subprocess

import pytest

from hpc_hub.agents.catalog import AGY, CLAUDE, CODEX, CURSOR
from hpc_hub.latex import assist

CHANGES = {"files": [
    {"path": "sections/sketch.tex", "old_path": "sections/sketch.tex", "status": "M", "binary": False,
     "hunks": [{"old": 40, "new": 40, "header": "\\subsection{Sketch}", "rows": [
         {"k": " ", "o": 43, "n": 43, "t": "required by the counter algorithm.", "m": []},
         {"k": "+", "o": None, "n": 44, "t": "Section~14 avoids this by keeping both counters implicit.", "m": []},
         {"k": "-", "o": 50, "n": None, "t": "moved away", "m": [], "mv": 1, "src": True}]}]},
    {"path": "refs.bib", "old_path": "", "status": "A", "binary": False,
     "hunks": [{"old": 0, "new": 1, "header": "", "rows": [{"k": "+", "o": None, "n": 1, "t": "@article{koutis2009,",
                                                             "m": []}]}]}]}


# -- the choice ----------------------------------------------------------------------------------------------------
def test_default_and_labels():
    assert assist.DEFAULT == assist.Choice("claude", "haiku", "low") == assist.check("claude", "haiku", "low")
    assert assist.label(assist.DEFAULT) == "Claude Haiku, Low"
    assert not hasattr(assist, "PRESETS") and not hasattr(assist, "preset")
    # model and effort are two choices: any of each
    for model in ("opus", "sonnet", "haiku", ""):
        for effort in ("", "low", "medium", "high", "xhigh", "max"):
            assert assist.check("claude", model, effort) == assist.Choice("claude", model, effort)
    assert assist.label(assist.Choice("claude", "opus", "xhigh")) == "Claude Opus, Extra high"
    assert assist.label(assist.Choice("claude", "haiku", "max")) == "Claude Haiku, Max"


def test_switch_agent_brings_its_own_model_and_effort():
    opus = assist.Choice("claude", "opus", "high")
    assert assist.switch(opus, "claude") == opus
    assert assist.switch(opus, "codex") == assist.Choice("codex", "", "high")  # no model setting; High carries over
    assert assist.switch(opus, "cursor") == assist.Choice("cursor", "", "")  # no Opus there, no effort setting
    assert assist.switch(assist.Choice("cursor", "auto", ""), "claude") == assist.DEFAULT
    assert assist.switch(assist.Choice("codex", "", "max"), "agy") == assist.Choice("agy", "", "max")
    assert assist.switch(assist.Choice("agy", "", "max"), "codex") == assist.Choice("codex", "", "low")  # no Max
    with pytest.raises(ValueError, match="No agent"):
        assist.switch(opus, "eliza")


def test_check_keeps_only_what_the_agent_offers():
    assert assist.check("codex", "haiku", "medium") == assist.Choice("codex", "", "medium")  # no model setting
    assert assist.check("cursor", "auto", "high") == assist.Choice("cursor", "auto", "")  # no effort setting
    assert assist.label(assist.check("codex", "", "medium")) == "ChatGPT, Medium"
    with pytest.raises(ValueError, match="no effort"):
        assist.check("claude", "haiku", "loud")
    with pytest.raises(ValueError, match="No agent"):
        assist.check("eliza")
    names = {a["id"]: a for a in assist.describe()}
    assert ["haiku", "Haiku"] in names["claude"]["models"] and names["codex"]["models"] == []
    assert names["cursor"]["efforts"] == [] and ["low", "Low"] in names["agy"]["efforts"]


# -- the diff ------------------------------------------------------------------------------------------------------
def test_diff_text_is_plain_and_leaves_moved_copies_out():
    d = assist.diff_text(CHANGES)
    assert "--- sections/sketch.tex\n@@ -40 +40 @@ \\subsection{Sketch}\n required by" in d
    assert "+Section~14 avoids" in d and "moved away" not in d
    assert "--- refs.bib (new file)" in d


def test_diff_text_is_trimmed_and_says_so():
    rows = [{"k": "+", "o": None, "n": i, "t": "x" * 50, "m": []} for i in range(1, 400)]
    big = {"files": [{"path": f"f{k}.tex", "old_path": "", "status": "M", "hunks": [{"old": 1, "new": 1, "header": "",
                                                                                     "rows": rows}]}
                     for k in range(6)]}
    d = assist.diff_text(big, limit=12_000, file_limit=3_000)
    assert len(d) < 13_000
    assert "more lines of this file left out" in d and "[Also changed, not shown: " in d


def test_numbered_lines_around():
    text = "\n".join(f"line {i}" for i in range(1, 101))
    out = assist.numbered(text, 50, 51, around=2)
    assert out.split("\n") == ["   48| line 48", "   49| line 49", "   50| line 50", "   51| line 51",
                               "   52| line 52", "   53| line 53"]


# -- Write message -------------------------------------------------------------------------------------------------
FILES = [{"path": "sections/sketch.tex", "added": 1, "removed": 0, "new": False},
         {"path": "refs.bib", "added": 6, "removed": 0, "new": True}]


def test_message_prompt_is_short_and_asks_for_json():
    p = assist.message_prompt(assist.diff_text(CHANGES), FILES, ["Fix fourth-moment constant: 9, not 3"], split=True)
    assert "Answer with JSON only" in p and '"commits"' in p and "- Fix fourth-moment constant" in p
    assert "- refs.bib +6 -0 (new)" in p
    one = assist.message_prompt("", FILES[:1], [], split=True)
    assert '"commits"' not in one  # one file: nothing to split
    assert len(p) < 3000


def test_parse_message_json_with_a_split():
    text = "Here it is:\n```json\n" + json.dumps({
        "subject": "Cite Koutis and Williams for the counter bound.", "body": "Section 13 needs it.",
        "commits": [{"files": ["refs.bib"], "subject": "Add Koutis and Williams (ICALP 2009)", "body": ""},
                    {"files": ["sketch.tex", "nope.tex"], "subject": "Say how Section 14 avoids the cost",
                     "body": "Answers the reading session."}]}) + "\n```"
    m = assist.parse_message(text, ["sections/sketch.tex", "refs.bib"])
    assert m["subject"] == "Cite Koutis and Williams for the counter bound" and m["body"] == "Section 13 needs it."
    assert [c["files"] for c in m["commits"]] == [["refs.bib"], ["sections/sketch.tex"]]


def test_parse_message_split_cleanup():
    paths = ["a.tex", "b.tex", "c.tex"]
    raw = {"subject": "S", "commits": [{"files": ["a.tex"], "subject": "A"}, {"files": ["a.tex", "b.tex"],
                                                                               "subject": "B"}]}
    m = assist.parse_message(json.dumps(raw), paths)
    assert [c["files"] for c in m["commits"]] == [["a.tex"], ["b.tex", "c.tex"]]  # each once; c.tex was forgotten
    one = {"subject": "S", "commits": [{"files": ["a.tex"], "subject": "A"}, {"files": ["zzz"], "subject": "B"}]}
    assert assist.parse_message(json.dumps(one), paths)["commits"] == []


def test_parse_message_plain_text():
    m = assist.parse_message("Subject: Tighten the bound in Theorem 2.\n\nBody: The old one was loose.\n", ["a"])
    assert m == {"subject": "Tighten the bound in Theorem 2", "body": "The old one was loose.", "commits": []}
    with pytest.raises(ValueError):
        assist.parse_message("```\n```", ["a"])


# -- Ask -----------------------------------------------------------------------------------------------------------
def test_ask_prompt_and_cites():
    p = assist.ask_prompt("Why 9 and not 3?", "commit a91c3e2", "Its diff: ...")
    assert "[[path:line]]" in p and p.endswith("Question: Why 9 and not 3?\n")
    a = assist.parse_answer("Yes. See [[sections/sketch.tex:30]] and [[sections/sketch.tex:22-23]], "
                            "also [[page 21]] and [[p. 3]]. Not a link: [[nothing]].")
    assert [(c["path"], c["line"], c["end"], c["page"]) for c in a["cites"]] == [
        ("sections/sketch.tex", 30, 30, 0), ("sections/sketch.tex", 22, 23, 0), ("", 0, 0, 21), ("", 0, 0, 3)]
    assert a["cites"][0]["ref"] == "[[sections/sketch.tex:30]]"
    with pytest.raises(ValueError):
        assist.parse_answer("  ")


# -- Check my list -------------------------------------------------------------------------------------------------
NOTES = [{"id": "n1", "text": "Cite Koutis and Williams", "place": {"path": "refs.bib", "line": 1}},
         {"id": "n2", "text": "Say where the 9 comes from", "place": {"page": 21, "x": 1, "y": 2}},
         {"id": "n3", "text": "Send the reply to mygroup", "place": None}]


def test_check_prompt_lists_notes_with_places():
    p = assist.check_prompt(NOTES, "diff")
    assert '- id n1: "Cite Koutis and Williams" (about refs.bib line 1)' in p
    assert "(about page 21 of the PDF)" in p and "Never say done without evidence" in p


def test_parse_check_one_result_per_note_in_order():
    text = json.dumps({"notes": [
        {"id": "n2", "verdict": "Not yet", "reason": "Only  hints at it.", "path": "sections/sketch.tex", "line": 30},
        {"id": "n1", "verdict": "done", "reason": "refs.bib adds koutis2009.", "path": "refs.bib", "line": 1},
        {"id": "n9", "verdict": "done"}]})
    r = assist.parse_check(text, NOTES)
    assert [(x["id"], x["verdict"]) for x in r] == [("n1", "done"), ("n2", "not_yet"), ("n3", "unsure")]
    assert r[1]["reason"] == "Only hints at it." and r[1]["line"] == 30
    assert r[2]["reason"] == "The agent did not say."
    assert [x["verdict"] for x in assist.parse_check("no json here", NOTES)] == ["unsure"] * 3


# -- run.sh --------------------------------------------------------------------------------------------------------
def test_agent_lines_have_no_tools_and_the_choice():
    c = assist.Choice("claude", "haiku", "low")
    line = assist.agent_line(CLAUDE, "claude", c)
    assert line == "claude -p --tools '' --no-session-persistence --model haiku --effort low < \"$D/prompt.md\""
    assert assist.agent_line(CLAUDE, "claude", c, plain=True) == "claude -p --model haiku < \"$D/prompt.md\""
    codex = assist.agent_line(CODEX, "codex", assist.Choice("codex", "", "medium"))
    assert "exec --skip-git-repo-check -s read-only -c model_reasoning_effort=medium" in codex
    assert "--mode ask --model auto" in assist.agent_line(CURSOR, "cursor-agent", assist.Choice("cursor", "auto"))
    assert assist.agent_line(AGY, "agy", assist.Choice("agy", "", "low")).endswith('-p "$(cat "$D/prompt.md")"')


def _fake(tmp_path, body: str):
    """A stand-in claude on PATH and HOME in tmp_path; returns the env."""
    bin_ = tmp_path / "bin"
    bin_.mkdir(exist_ok=True)
    exe = bin_ / "claude"
    exe.write_text("#!/bin/bash\n" + body)
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    return {**os.environ, "HOME": str(tmp_path), "PATH": f"{bin_}:/usr/bin:/bin"}  # never a real agent


def _run(env, job_id, prompt, choice=assist.Choice("claude", "haiku", "low")):
    run_sh = assist.run_script(job_id, CLAUDE, "claude", choice, timeout=20)
    subprocess.run(["bash", "-c", assist.prepare_script(job_id, run_sh)], input=prompt.encode(), env=env, check=True)
    return subprocess.run(["bash", "-c", assist.start_line(job_id)], capture_output=True, text=True, env=env,
                          timeout=60)


def test_run_script_answers_after_the_mark_and_cleans_up(tmp_path):
    env = _fake(tmp_path, 'echo "args: $*"; echo "prompt: $(cat)"\n')
    res = _run(env, "abc123", "Write a message")
    assert res.returncode == 0
    out = assist.answer("noise from .bashrc\n" + res.stdout)
    assert "args: -p --tools  --no-session-persistence --model haiku --effort low" in out
    assert "prompt: Write a message" in out
    assert not (tmp_path / assist.RUN_ROOT / "abc123").exists()


def test_run_script_falls_back_for_an_older_agent(tmp_path):
    env = _fake(tmp_path, 'for a in "$@"; do [ "$a" = --tools ] && { echo "error: unknown option \'--tools\'" >&2; '
                          'exit 1; }; done; echo "plain $*"\n')
    res = _run(env, "abc124", "x")
    assert res.returncode == 0 and assist.answer(res.stdout).strip() == "plain -p --model haiku"


def test_run_script_failure_and_cancel(tmp_path):
    env = _fake(tmp_path, 'echo "Not logged in" >&2; exit 3\n')
    res = _run(env, "abc125", "x")
    assert res.returncode == 3 and "Not logged in" in res.stderr
    env = _fake(tmp_path, "sleep 30\n")
    run_sh = assist.run_script("abc126", CLAUDE, "claude", assist.Choice(), timeout=60)
    subprocess.run(["bash", "-c", assist.prepare_script("abc126", run_sh)], input=b"x", env=env, check=True)
    p = subprocess.Popen(["bash", "-c", assist.start_line("abc126")], env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True)
    pid = tmp_path / assist.RUN_ROOT / "abc126" / "pid"
    for _ in range(100):
        if pid.exists() and pid.read_text().strip():
            break
        subprocess.run(["sleep", "0.05"])
    subprocess.run(["bash", "-c", assist.cancel_line("abc126")], env=env, check=True)
    assert p.wait(timeout=20) != 0
    assert not (tmp_path / assist.RUN_ROOT / "abc126").exists()


def test_ids_are_checked():
    with pytest.raises(ValueError):
        assist.run_dir("../etc")
