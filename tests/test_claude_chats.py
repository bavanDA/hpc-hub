import json
import os
import subprocess

from hpc_hub import claude_chats


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
    out = subprocess.run(["bash", "-c", claude_chats.command()], capture_output=True, text=True,
                         env={**os.environ, "HOME": str(tmp_path)}, check=True).stdout
    chats = claude_chats.parse(out)
    assert [c.id for c in chats] == ["bbb", "aaa"]
    assert (chats[0].name, chats[0].cwd) == ("My chat", "/proj")
    assert (chats[1].title, chats[1].first, chats[1].last, chats[1].cwd) == ("Fix build", "fix the build", "thanks", "/home/me")


def test_parse_bad_output():
    assert claude_chats.parse("") == [] and claude_chats.parse("oops") == []
