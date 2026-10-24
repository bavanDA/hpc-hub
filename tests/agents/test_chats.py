import json
import os
import subprocess

from hpc_hub.agents import chats


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
        {"type": "user", "isMeta": True, "message": {"content": "<command-name>/clear</command-name>"},
         "cwd": "/home/me"},
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
    c = found[1]
    assert (c.title, c.first, c.last, c.cwd) == ("Fix build", "fix the build", "thanks", "/home/me")


def test_parse_bad_output():
    assert chats.parse("") == [] and chats.parse("oops") == []


def test_codex_chats(tmp_path):
    cid = "01a12da0-eac3-7b13-b4bb-cf532f0e0d5d"
    day = tmp_path / ".codex" / "sessions" / "2026" / "10" / "11"
    _write(day / f"rollout-2026-10-11T21-01-23-{cid}.jsonl", [
        {"type": "session_meta", "payload": {"id": cid, "cwd": "/scratch/myproj"}},
        {"type": "response_item", "payload": {"type": "message", "role": "developer", "content": []}},
        {"type": "event_msg", "payload": {"type": "user_message", "message": "run the tests"}},
    ], 1000)
    (tmp_path / ".codex" / "session_index.jsonl").write_text(
        "".join(json.dumps({"id": cid, "thread_name": n}) + "\n" for n in ("old name", "Run tests")))
    found = _run(tmp_path, "codex")
    assert [(c.id, c.cwd, c.title, c.first) for c in found] == [(cid, "/scratch/myproj", "Run tests", "run the tests")]


def test_agy_chats(tmp_path):
    import sqlite3
    d = tmp_path / ".gemini" / "antigravity-cli"
    d.mkdir(parents=True)
    con = sqlite3.connect(d / "conversation_summaries.db")
    con.execute("create table conversation_summaries (conversation_id text, title text, preview text, "
                "last_modified_time datetime, workspace_uris text, parent_conversation_id text)")
    con.execute("insert into conversation_summaries values ('c1', '', 'Fix thesis code', "
                "'2026-07-17 16:49:33.047864752+00:00', '[\"file:///nfs/thesis\"]', '')")
    con.execute("insert into conversation_summaries values ('sub', '', 'child', "
                "'2026-07-18 16:49:33+00:00', '[]', 'c1')")
    con.commit()
    found = _run(tmp_path, "agy")
    assert [(c.id, c.cwd, c.name) for c in found] == [("c1", "/nfs/thesis", "Fix thesis code")]
    assert found[0].mtime == 1784306973


def test_missing_stores_are_empty(tmp_path):
    for agent in ("claude", "codex", "agy"):
        assert _run(tmp_path, agent) == []


def test_last_list_is_kept_and_private(tmp_path, monkeypatch):
    import os
    import stat

    from hpc_hub.agents import chats
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
    assert chats.recall("wulver\nclaude\n") is None
    kept = [chats.Chat("c1", "/home/jdoe", "Fix build", "fix it", "done", 5, 10, "-home-jdoe")]
    chats.remember("wulver\nclaude\n", kept, {"home": "/home/jdoe"})
    back, extra = chats.recall("wulver\nclaude\n")
    assert back == kept and extra == {"home": "/home/jdoe"}
    files = list((tmp_path / "hpc-hub" / "chats").iterdir())
    assert len(files) == 1 and stat.S_IMODE(os.stat(files[0]).st_mode) == 0o600
