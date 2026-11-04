import json
import os

from hpc_hub.agents import chat_copy, chats
from hpc_hub.files import transfer
from tests.helpers import LocalShell


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
    assert chat_copy.project_dir("/mmfs1/scratch/mygroup/jdoe/myproj") == "-mmfs1-scratch-mygroup-jdoe-myproj"
    assert chat_copy.project_dir("/home/a/my.proj_x/") == "-home-a-my-proj-x"


def test_moved_changes_whole_paths_only():
    data = b'{"cwd":"/s/myproj","t":"see /s/myproj/a.c and /s/myproj2"}'
    assert chat_copy.moved(data, "/s/myproj", "/e/kp") == b'{"cwd":"/e/kp","t":"see /e/kp/a.c and /s/myproj2"}'


def test_copy_chat_with_its_files(tmp_path):
    wulver, expanse = tmp_path / "w", tmp_path / "e"
    pdir = wulver / ".claude/projects/-s-myproj"
    (pdir / "abc/subagents").mkdir(parents=True)
    (pdir / "abc/subagents/agent-1.jsonl").write_text("{}\n")
    (pdir / "abc.jsonl").write_text(json.dumps({"type": "user", "cwd": "/s/myproj"}) + "\n")
    (wulver / ".claude/file-history/abc").mkdir(parents=True)
    (wulver / ".claude/file-history/abc/f1").write_text("old")
    chat = chats.Chat("abc", "/s/myproj", "t", "", "", 0, 100, "-s-myproj")
    folder = chat_copy.copy(HomeShell(wulver), chat, HomeShell(expanse), "~/myproj", transfer.Progress())
    assert folder == f"{expanse}/myproj"
    new = expanse / ".claude/projects" / chat_copy.project_dir(folder)
    assert json.loads((new / "abc.jsonl").read_text())["cwd"] == folder
    assert (new / "abc/subagents/agent-1.jsonl").exists()
    assert (expanse / ".claude/file-history/abc/f1").read_text() == "old"
    assert not os.path.exists(new / "abc.jsonl.new")


def test_copy_files_the_chat_under_the_real_folder(tmp_path):
    """Wulver's /scratch is a link to /mmfs1/scratch: Claude looks the chat up under the real path."""
    wulver = tmp_path / "w"
    pdir = wulver / ".claude/projects/-s-myproj"
    pdir.mkdir(parents=True)
    (pdir / "abc.jsonl").write_text(json.dumps({"type": "user", "cwd": "/s/myproj"}) + "\n")
    (tmp_path / "mmfs1-scratch").mkdir()
    (tmp_path / "scratch").symlink_to(tmp_path / "mmfs1-scratch")
    chat = chats.Chat("abc", "/s/myproj", "t", "", "", 0, 100, "-s-myproj")
    folder = chat_copy.copy(HomeShell(wulver), chat, HomeShell(wulver), str(tmp_path / "scratch/groupB/myproj"),
                            transfer.Progress())
    assert folder == str(tmp_path / "mmfs1-scratch/groupB/myproj")
    new = wulver / ".claude/projects" / chat_copy.project_dir(folder)
    assert json.loads((new / "abc.jsonl").read_text())["cwd"] == folder
