import json
import os
import subprocess

from hpc_hub import chats


def _run(home, agent):
    out = subprocess.run(["bash", "-c", chats.command(agent)], capture_output=True, text=True,
                         env={**os.environ, "HOME": str(home)}, check=True)
    assert not out.stderr, out.stderr
    return chats.parse(out.stdout)


def _write(path, rows, mtime):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    os.utime(path, (mtime, mtime))


def test_script_lists_chats(tmp_path):
    proj = tmp_path / ".claude" / "projects"
    _write(proj / "-home-me" / "aaa.jsonl", [
        {"type": "mode", "mode": "normal"},
        {"type": "user", "isMeta": True, "message": {"content": "<command-name>/clear</command-name>"}, "cwd": "/home/me"},
        {"type": "user", "message": {"content": [{"type": "text", "text": "fix the build"}]}, "cwd": "/home/me"},
        {"type": "ai-title", "aiTitle": "Fix build"},
        {"type": "last-prompt", "lastPrompt": "thanks"},
    ], 1000)
    _write(proj / "-proj" / "bbb.jsonl", [
        {"type": "user", "message": {"content": "hello"}, "cwd": "/proj"},
        {"type": "custom-title", "customTitle": "My chat"},
        {"type": "ai-title", "aiTitle": "Greeting"},
    ], 2000)
    _write(proj / "-proj" / "empty.jsonl", [{"type": "mode", "mode": "normal"}], 3000)
    found = _run(tmp_path, "claude")
    assert [c.id for c in found] == ["bbb", "aaa"]
    assert (found[0].name, found[0].cwd) == ("My chat", "/proj")
    assert (found[1].title, found[1].first, found[1].last, found[1].cwd) == ("Fix build", "fix the build", "thanks", "/home/me")


def test_parse_bad_output():
    assert chats.parse("") == [] and chats.parse("oops") == []


def test_codex_chats(tmp_path):
    cid = "01a12da0-eac3-7b13-b4bb-cf532f0e0d5d"
    day = tmp_path / ".codex" / "sessions" / "2026" / "10" / "11"
    _write(day / f"rollout-2026-10-11T21-01-23-{cid}.jsonl", [
        {"type": "session_meta", "payload": {"id": cid, "cwd": "/scratch/myproject"}},
        {"type": "response_item", "payload": {"type": "message", "role": "developer", "content": []}},
        {"type": "event_msg", "payload": {"type": "user_message", "message": "run the tests"}},
    ], 1000)
    (tmp_path / ".codex" / "session_index.jsonl").write_text(
        json.dumps({"id": cid, "thread_name": "old name"}) + "\n" + json.dumps({"id": cid, "thread_name": "Run tests"}) + "\n")
    found = _run(tmp_path, "codex")
    assert [(c.id, c.cwd, c.title, c.first) for c in found] == [(cid, "/scratch/myproject", "Run tests", "run the tests")]


def test_agy_chats(tmp_path):
    import sqlite3
    d = tmp_path / ".gemini" / "antigravity-cli"
    d.mkdir(parents=True)
    con = sqlite3.connect(d / "conversation_summaries.db")
    con.execute("create table conversation_summaries (conversation_id text, title text, preview text, "
                "last_modified_time datetime, workspace_uris text, parent_conversation_id text)")
    con.execute("insert into conversation_summaries values ('c1', '', 'Fix MC code', "
                "'2026-07-17 16:49:33.047864752+00:00', '[\"file:///nfs/MC\"]', '')")
    con.execute("insert into conversation_summaries values ('sub', '', 'child', "
                "'2026-07-18 16:49:33+00:00', '[]', 'c1')")
    con.commit()
    found = _run(tmp_path, "agy")
    assert [(c.id, c.cwd, c.name) for c in found] == [("c1", "/nfs/MC", "Fix MC code")]
    assert found[0].mtime == 1784306973


def test_missing_stores_are_empty(tmp_path):
    for agent in ("claude", "codex", "agy"):
        assert _run(tmp_path, agent) == []
