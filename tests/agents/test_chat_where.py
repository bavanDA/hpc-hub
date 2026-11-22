"""Continue on an ended Claude tab (2026-11-22, the owner): the chat's id and folder are found from the tab's tmux
name alone, also after the session and its job ended, so claude --resume picks it up in the same folder. The
script runs here on a made-up home."""

import json
import os
import subprocess
import sys
import time

import pytest

from hpc_hub.agents import catalog, chat_view
from hpc_hub.core.cluster_settings import AgentSettings

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="the script runs in a POSIX home")
CHAT = "3f2a9c1e-1111-4222-8333-444455556666"
SESSION = "hpchub-claude-1621000-3f2a9c1e"


class Here:
    """ssh.run on this machine, with HOME set to the made-up home."""
    def __init__(self, home):
        self.home = home

    def run(self, cmd, timeout=60):
        env = {**os.environ, "HOME": str(self.home)}
        return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=timeout, env=env)


def chat_file(home, chat_id, lines, folder="-home-jdoe-proj"):
    d = home / ".claude" / "projects" / folder
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"{chat_id}.jsonl"
    f.write_text("".join(json.dumps(x) + "\n" for x in lines))
    return f


def test_an_ended_chat_gives_its_id_and_folder(tmp_path):
    chat_file(tmp_path, CHAT, [{"type": "summary"}, {"type": "user", "cwd": "/home/jdoe/proj", "message": {}}])
    assert chat_view.where(Here(tmp_path), SESSION) == {"chat_id": CHAT, "folder": "/home/jdoe/proj"}


def test_the_newest_file_with_the_tag_wins(tmp_path):
    old = chat_file(tmp_path, "3f2a9c1e-0000-4000-8000-000000000000", [{"cwd": "/home/jdoe/old"}], "-a")
    os.utime(old, (time.time() - 3600, time.time() - 3600))
    chat_file(tmp_path, CHAT, [{"cwd": "/home/jdoe/new"}], "-b")
    assert chat_view.where(Here(tmp_path), SESSION)["folder"] == "/home/jdoe/new"


def test_a_line_that_isnt_json_is_passed_over(tmp_path):
    f = chat_file(tmp_path, CHAT, [])
    f.write_text("not json\n" + json.dumps({"cwd": "/scratch/jdoe"}) + "\n")
    assert chat_view.where(Here(tmp_path), SESSION)["folder"] == "/scratch/jdoe"


def test_a_chat_that_never_said_its_folder_continues_in_home(tmp_path):
    chat_file(tmp_path, CHAT, [{"type": "summary"}])
    assert chat_view.where(Here(tmp_path), SESSION) == {"chat_id": CHAT, "folder": ""}


def test_no_saved_chat_says_so(tmp_path):
    (tmp_path / ".claude" / "projects").mkdir(parents=True)
    with pytest.raises(RuntimeError, match="never saved this chat"):
        chat_view.where(Here(tmp_path), SESSION)


def test_a_tab_that_isnt_a_claude_chat_is_refused(tmp_path):
    for session in ("hpchub-term-1122-101010", "hpchub-codex-1621000-ab12cd34", "x; rm -rf ~"):
        with pytest.raises(ValueError):
            chat_view.where(Here(tmp_path), session)


def test_continuing_resumes_the_same_chat_under_the_same_tag():
    """tools.agent_start names the tab hpchub-claude-<job>-<chat id's start>: the Chat view finds the same file."""
    line = catalog.command(catalog.CLAUDE, AgentSettings(), CHAT)
    assert f"--resume {CHAT}" in line and "--session-id" not in line
    assert chat_view.tag_of(f"hpchub-claude-1700000-{CHAT[:8]}") == chat_view.tag_of(SESSION)
