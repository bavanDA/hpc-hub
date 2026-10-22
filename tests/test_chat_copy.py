import json
import os

from hpc_hub import chat_copy, chats, transfer
from tests.test_remote_fs import LocalShell


class HomeShell(LocalShell):
    """A 'cluster' whose $HOME is its own folder."""

    def __init__(self, home):
        self.home = str(home)

    def argv(self, command, tty=False):
        return ["env", f"HOME={self.home}", "bash", "-c", command]

    def run(self, command, timeout=60, fast=None):
        import subprocess
        return subprocess.run(self.argv(command), capture_output=True, text=True, timeout=timeout)


def test_project_dir_matches_claude():
    assert chat_copy.project_dir("/mmfs1/scratch/mygroup/jdoe/myproject") == "-mmfs1-scratch-mygroup-jdoe-myproject"
    assert chat_copy.project_dir("/home/a/my.proj_x/") == "-home-a-my-proj-x"


def test_moved_changes_whole_paths_only():
    data = b'{"cwd":"/s/myproject","t":"see /s/myproject/a.c and /s/myproject2"}'
    assert chat_copy.moved(data, "/s/myproject", "/e/kp") == b'{"cwd":"/e/kp","t":"see /e/kp/a.c and /s/myproject2"}'


def test_copy_chat_with_its_files(tmp_path):
    wulver, expanse = tmp_path / "w", tmp_path / "e"
    pdir = wulver / ".claude/projects/-s-myproject"
    (pdir / "abc/subagents").mkdir(parents=True)
    (pdir / "abc/subagents/agent-1.jsonl").write_text("{}\n")
    (pdir / "abc.jsonl").write_text(json.dumps({"type": "user", "cwd": "/s/myproject"}) + "\n")
    (wulver / ".claude/file-history/abc").mkdir(parents=True)
    (wulver / ".claude/file-history/abc/f1").write_text("old")
    chat = chats.Chat("abc", "/s/myproject", "t", "", "", 0, 100, "-s-myproject")
    folder = chat_copy.copy(HomeShell(wulver), chat, HomeShell(expanse), "~/myproject", transfer.Progress())
    assert folder == f"{expanse}/myproject"
    new = expanse / ".claude/projects" / chat_copy.project_dir(folder)
    assert json.loads((new / "abc.jsonl").read_text())["cwd"] == folder
    assert (new / "abc/subagents/agent-1.jsonl").exists()
    assert (expanse / ".claude/file-history/abc/f1").read_text() == "old"
    assert not os.path.exists(new / "abc.jsonl.new")
