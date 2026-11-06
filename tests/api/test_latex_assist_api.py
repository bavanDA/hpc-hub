"""The agent RPCs of a paper's History, end to end against a real repository, with a stand-in claude on PATH (no
real agent runs) and the node's ssh run right here."""

import json
import stat
import threading
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods.latex import agent, ask, write
from hpc_hub.api.methods.latex import git as git_api
from hpc_hub.api.methods.latex import notes as notes_api
from hpc_hub.core import config
from hpc_hub.core.config import AgentSettings
from hpc_hub.latex import notes
from tests.api.test_latex_api import FakeHub
from tests.api.test_latex_history_api import git, wait

ANSWER = {"subject": "Say how Section 14 avoids the cost", "body": "Answers the reading session.",
          "commits": [{"files": ["refs.bib"], "subject": "Add Koutis and Williams", "body": ""},
                      {"files": ["main.tex"], "subject": "Say how Section 14 avoids the cost", "body": ""}]}


@pytest.fixture
def h(monkeypatch, tmp_path):
    fake = FakeHub()
    for s in fake.sessions.values():
        s.cfg.claude = AgentSettings()
        s.allocation = SimpleNamespace(job_id="123", node="n0007")
    monkeypatch.setattr(hub_module, "_hub", fake)
    monkeypatch.setattr(agent.tmux, "on", lambda node, line, tty=False: line)  # the node is this machine
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "app.toml")
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    exe = bin_ / "claude"
    # answers by what the prompt asks for; the prompt is kept to look at
    exe.write_text("#!/bin/bash\np=$(cat); printf %s \"$p\" > \"$HOME/last-prompt\"\n"
                   "echo \"$*\" > \"$HOME/last-args\"\n"
                   "[ -f \"$HOME/slow\" ] && sleep 30\n"
                   "case \"$p\" in\n"
                   f"  *'commit message'*) echo {json.dumps(json.dumps(ANSWER))} ;;\n"
                   "  *'open notes'*) echo '{\"notes\": [{\"id\": \"'$(cat \"$HOME/note-id\")'\", "
                   "\"verdict\": \"done\", "
                   "\"reason\": \"main.tex says it.\", \"path\": \"main.tex\", \"line\": 3}]}' ;;\n"
                   "  *) echo 'Because of [[main.tex:3]].' ;;\nesac\n")
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PATH", f"{bin_}:/usr/bin:/bin")  # only the stand-in: never a real agent
    return fake


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "paper"
    r.mkdir()
    git(tmp_path, "init", "-q", "-b", "main", str(r))
    git(r, "config", "user.name", "jdoe")
    git(r, "config", "user.email", "jdoe@example.edu")
    (r / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n")
    git(r, "add", "-A")
    git(r, "commit", "-qm", "First draft")
    (r / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\nHello, Section 14.\n\\end{document}\n")
    (r / "refs.bib").write_text("@article{koutis2009,\n}\n")
    return r


def end(h, job):
    return wait(h, "latex-agent", lambda e: e["id"] == job["id"] and e["done"])


def test_choice_is_kept_for_every_paper(h):
    c = agent.agent_choice()
    assert (c["agent"], c["model"], c["effort"], c["label"]) == ("claude", "haiku", "low", "Claude Haiku, Low")
    assert "preset" not in c and "presets" not in c
    assert [a["name"] for a in c["agents"]] == ["Claude", "ChatGPT", "Antigravity", "Cursor"]
    c = agent.agent_choose(model="opus")  # in the paper: the model alone, the effort stays
    assert (c["agent"], c["model"], c["effort"]) == ("claude", "opus", "low")
    c = agent.agent_choose(effort="xhigh", split=False)
    assert (c["model"], c["effort"], c["split"], c["label"]) == ("opus", "xhigh", False, "Claude Opus, Extra high")
    saved = config.load_app(config.APP_FILE)
    assert (saved.paper_model, saved.paper_effort) == ("opus", "xhigh")
    with pytest.raises(ValueError):
        agent.agent_choose(model="gpt")
    assert agent.agent_choice()["model"] == "opus"


def test_settings_picks_the_agent(h):
    agent.agent_choose(model="opus", effort="high")
    c = agent.agent_choose("codex")  # Settings sends the agent alone
    assert (c["agent"], c["model"], c["effort"], c["label"]) == ("codex", "", "high", "ChatGPT, High")
    c = agent.agent_choose("cursor")
    assert (c["agent"], c["model"], c["effort"]) == ("cursor", "", "")
    c = agent.agent_choose(model="auto")
    assert c["label"] == "Cursor Auto"
    c = agent.agent_choose("claude")
    assert (c["agent"], c["model"], c["effort"]) == ("claude", "haiku", "low")
    assert config.load_app(config.APP_FILE).paper_agent == "claude"


def test_a_broken_saved_choice_falls_back_to_haiku_low(h):
    config.APP_FILE.write_text('[app]\npaper_agent = "eliza"\npaper_model = "gpt"\n')
    c = agent.agent_choice()
    assert (c["agent"], c["model"], c["effort"]) == ("claude", "haiku", "low")
    assert agent.agent_choose(effort="max")["label"] == "Claude Haiku, Max"


def test_write_message_in_the_background(h, repo, tmp_path):
    job = write.agent_write("wulver", str(repo))
    assert job["node"] == "n0007" and job["label"] == "Claude Haiku, Low"
    e = end(h, job)
    assert e["ok"], e
    r = e["result"]
    assert r["subject"] == ANSWER["subject"] and [c["files"] for c in r["commits"]] == [["refs.bib"], ["main.tex"]]
    assert {f["path"] for f in r["files"]} == {"main.tex", "refs.bib"}
    running = next(x for n, x in h.events
                   if n == "latex-agent" and x["id"] == job["id"] and x.get("stage") == "running")
    assert running["about"] == {"files": 2, "lines": 4}
    prompt = (tmp_path / "last-prompt").read_text()
    assert "+Hello, Section 14." in prompt and "- First draft" in prompt
    assert "--tools  --no-session-persistence --model haiku --effort low" in (tmp_path / "last-args").read_text()
    assert git(repo, "status", "--porcelain").strip()  # nothing committed


def test_split_commits_only_when_asked(h, repo):
    git_api.git_commit_split("wulver", str(repo), [
        {"message": "Add Koutis and Williams", "files": ["refs.bib"]},
        {"message": "Say how Section 14 avoids the cost", "files": ["main.tex"]}])
    last, first = (git(repo, "show", "--format=%s", "--name-only", r).split() for r in ("HEAD", "HEAD~1"))
    assert " ".join(last).startswith("Say how Section 14") and last[-1] == "main.tex"
    assert " ".join(first).startswith("Add Koutis") and first[-1] == "refs.bib"
    assert not git(repo, "status", "--porcelain").strip()


def test_ask_about_a_commit_with_a_one_time_choice(h, repo, tmp_path):
    job = ask.agent_ask("wulver", str(repo), "Why?", {"kind": "commit", "hash": "HEAD"},
                        choice={"model": "opus", "effort": "max"})
    assert job["label"] == "Claude Opus, Max" and job["agent"] == "claude"
    e = end(h, job)
    assert e["ok"] and e["result"]["cites"][0]["path"] == "main.tex" and e["result"]["question"] == "Why?"
    assert "First draft" in (tmp_path / "last-prompt").read_text()
    assert "--model opus --effort max" in (tmp_path / "last-args").read_text()
    assert agent.agent_choice()["model"] == "haiku"  # your usual choice stays


def test_a_one_time_choice_keeps_your_agent(h, repo, tmp_path):
    codex = tmp_path / "bin" / "codex"  # a stand-in too: never a real agent
    codex.write_text("#!/bin/bash\necho \"$*\" > \"$HOME/last-args\"\necho 'Because of [[main.tex:3]].'\n")
    codex.chmod(codex.stat().st_mode | stat.S_IEXEC)
    agent.agent_choose("codex")
    with pytest.raises(ValueError, match="no reasoning effort max"):  # ChatGPT's efforts stop at Extra high
        ask.agent_ask("wulver", str(repo), "Why?", {"kind": "commit", "hash": "HEAD"}, choice={"effort": "max"})
    job = ask.agent_ask("wulver", str(repo), "Why?", {"kind": "commit", "hash": "HEAD"},
                        choice={"agent": "claude", "model": "opus", "effort": "medium"})
    assert job["agent"] == "codex" and job["label"] == "ChatGPT, Medium"  # same agent; no model setting there
    assert end(h, job)["ok"]
    assert "model_reasoning_effort=medium" in (tmp_path / "last-args").read_text()


def test_ask_about_lines(h, repo, tmp_path):
    e = end(h, ask.agent_ask("wulver", str(repo), "Does this read worse?",
                             {"kind": "lines", "path": "main.tex", "line": 3, "end": 3, "text": "Section 14"}))
    assert e["ok"]
    p = (tmp_path / "last-prompt").read_text()
    assert "    3| Hello, Section 14." in p and "The selected text: 'Section 14'" in p


def test_no_node_no_job(h, repo):
    h.sessions["wulver"].allocation = None
    with pytest.raises(RuntimeError, match="compute node"):
        write.agent_write("wulver", str(repo))


def test_a_missing_agent_says_so(h, repo, tmp_path):
    (tmp_path / "bin" / "claude").unlink()
    e = end(h, write.agent_write("wulver", str(repo)))
    assert not e["ok"] and "isn't installed on Wulver" in e["error"]


def test_cancel(h, repo, tmp_path):
    (tmp_path / "slow").write_text("")
    job = write.agent_write("wulver", str(repo))
    wait(h, "latex-agent", lambda e: e["id"] == job["id"] and e.get("stage") == "running")
    pid = tmp_path / ".hpc-hub" / "paper-agent" / job["id"] / "pid"
    wait_for = threading.Event()
    for _ in range(100):
        if pid.exists() and pid.read_text().strip():
            break
        wait_for.wait(0.05)
    assert agent.agent_cancel(job["id"])
    e = end(h, job)
    assert not e["ok"] and e["cancelled"] and "result" not in e


def test_notes_and_check_my_list(h, repo, tmp_path):
    a = notes_api.note_add("wulver", str(repo), "Say where Section 14 comes in", {"path": "main.tex", "line": 3})
    b = notes_api.note_add("wulver", str(repo), "Send the reply to mygroup")
    assert (a["author"], a["n"], b["n"], b["place"]) == ("jdoe", 1, 2, None)
    stored = repo / ".git" / "hpc-hub" / "notes.json"
    assert stored.exists() and "hpc-hub" not in git(repo, "status", "--porcelain")
    notes_api.note_set("wulver", str(repo), b["id"], done=True)
    got = notes_api.notes_list("wulver", str(repo))
    assert got["user"] == "jdoe" and got["root"] == str(repo) and [n["done"] for n in got["notes"]] == [False, True]
    assert got["notes"][1]["done_by"] == "jdoe"
    (tmp_path / "note-id").write_text(a["id"])
    e = end(h, notes_api.agent_check("wulver", str(repo)))
    assert e["ok"] and e["result"]["checked"] == 1
    assert e["result"]["results"] == [{"id": a["id"], "verdict": "done", "reason": "main.tex says it.",
                                       "path": "main.tex", "line": 3}]
    assert not notes_api.notes_list("wulver", str(repo))["notes"][0]["done"]  # the agent never checks anything off
    notes_api.note_delete("wulver", str(repo), a["id"])
    assert [n["id"] for n in notes_api.notes_list("wulver", str(repo))["notes"]] == [b["id"]]


def test_notes_write_only_over_what_was_read(h, repo):
    ssh = h.sessions["wulver"].ssh
    notes_api.note_add("wulver", str(repo), "one")
    path = str(repo / ".git" / "hpc-hub" / "notes.json")
    read, digest = notes._read(ssh, path)
    notes_api.note_add("wulver", str(repo), "two")  # someone else wrote in between
    assert not notes._write(ssh, path, read + [{"id": "x", "text": "lost"}], digest)
    assert [n["text"] for n in notes_api.notes_list("wulver", str(repo))["notes"]] == ["one", "two"]


def test_bad_places_and_text(h, repo):
    with pytest.raises(ValueError):
        notes_api.note_add("wulver", str(repo), "x", {"path": "../etc/passwd", "line": 1})
    with pytest.raises(ValueError):
        notes_api.note_add("wulver", str(repo), "   ")
    n = notes_api.note_add("wulver", str(repo), "Pin", {"page": 21, "x": 300.5, "y": 410})
    assert n["place"] == {"page": 21, "x": 300.5, "y": 410.0}
