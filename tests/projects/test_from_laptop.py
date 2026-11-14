"""A project from this computer to a cluster: only the picked folder and its own Claude chats are read; chats are
filed under the cluster's path; the files arrive whole. The "cluster" here is a folder on this machine."""

import io
import json
import os
import tarfile
import time
from types import SimpleNamespace

import pytest

from hpc_hub.agents.chat_copy import project_dir
from hpc_hub.projects import from_laptop
from tests.helpers import LocalShell, on_linux_cluster


def chat_lines(cwd: str, first: str, title: str = "") -> bytes:
    lines = [{"type": "user", "cwd": cwd, "message": {"content": first}},
             {"type": "assistant", "cwd": cwd,
              "message": {"content": [{"type": "text", "text": f"Edited {cwd}/a.py"}]}}]
    if title:
        lines.append({"type": "ai-title", "aiTitle": title})
    return b"\n".join(json.dumps(x).encode() for x in lines) + b"\n"


@pytest.fixture
def laptop(tmp_path, monkeypatch):
    """A project with a subfolder, its two chats (one from the subfolder), and a chat of another project."""
    claude = tmp_path / "claude"
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(claude))
    project = tmp_path / "work" / "thesis"
    (project / "src").mkdir(parents=True)
    (project / "src" / "a.py").write_text("print('hi')\n")
    (project / "data.bin").write_bytes(b"x" * 5000)
    (project / "results").mkdir()
    (project / "results" / "big.out").write_bytes(b"y" * 9000)
    other = tmp_path / "work" / "thesis-old"  # a name that starts the same: must not count
    other.mkdir()
    for cwd, cid, first in [(project, "c1", "Fix the plot"), (project / "src", "c2", "Explain a.py"),
                            (other, "c3", "Old work, private")]:
        d = claude / "projects" / project_dir(str(cwd))
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{cid}.jsonl").write_bytes(chat_lines(str(cwd), first, title=f"Chat {cid}"))
    (claude / "projects" / project_dir(str(project)) / "c1").mkdir()  # its subagents
    (claude / "projects" / project_dir(str(project)) / "c1" / "agent-1.jsonl").write_text("{}\n")
    (claude / "file-history" / "c1").mkdir(parents=True)
    (claude / "file-history" / "c1" / "a.py@v1").write_text("old\n")
    return SimpleNamespace(project=project, other=other, claude=claude)


def test_only_the_projects_own_chats(laptop):
    found = from_laptop.chats(str(laptop.project))
    assert sorted(c.id for c in found) == ["c1", "c2"]  # not c3, from thesis-old
    c1 = next(c for c in found if c.id == "c1")
    assert c1.name == "Chat c1" and c1.cwd == str(laptop.project)
    assert c1.size > len(chat_lines(str(laptop.project), "Fix the plot", "Chat c1"))  # with subagents and history


def test_parts_biggest_first(laptop):
    assert [n for n, _ in from_laptop.parts(str(laptop.project))] == ["results", "data.bin", "src"]


def test_pack_leaves_out_what_you_untick(laptop):
    buf, sent = io.BytesIO(), []
    from_laptop.pack(str(laptop.project), buf, ["results"], sent.append)
    names = tarfile.open(fileobj=io.BytesIO(buf.getvalue())).getnames()
    assert "thesis/src/a.py" in names and "thesis/data.bin" in names
    assert not [n for n in names if n.startswith("thesis/results")]
    assert sum(sent) == len(buf.getvalue())


def test_pack_stops_when_cancelled(laptop):
    with pytest.raises(InterruptedError):
        from_laptop.pack(str(laptop.project), io.BytesIO(), [], stop=lambda: True)


def test_paths_move_to_the_cluster():
    data = b'{"cwd":"/home/me/thesis","x":"/home/me/thesis/src/a.py","y":"/home/me/thesis2/z"}'
    out = from_laptop.moved_from(data, "/home/me/thesis", "/project/jdoe/thesis")
    assert out == b'{"cwd":"/project/jdoe/thesis","x":"/project/jdoe/thesis/src/a.py","y":"/home/me/thesis2/z"}'


def test_windows_paths_take_the_clusters_slashes():
    data = json.dumps({"cwd": "C:\\Users\\me\\thesis", "x": "C:\\Users\\me\\thesis\\src\\a.py",
                       "y": "C:\\Users\\me\\thesis2\\z"}).encode()
    out = json.loads(from_laptop.moved_from(data, "C:\\Users\\me\\thesis", "/project/jdoe/thesis"))
    assert out == {"cwd": "/project/jdoe/thesis", "x": "/project/jdoe/thesis/src/a.py",
                   "y": "C:\\Users\\me\\thesis2\\z"}


def test_a_whole_home_folder_is_refused(tmp_path, monkeypatch):
    from hpc_hub.api.methods import projects_local
    monkeypatch.setenv("HOME", str(tmp_path))
    with pytest.raises(ValueError, match="not your whole home folder"):
        projects_local._folder(str(tmp_path))
    with pytest.raises(ValueError, match="Pick a folder"):
        projects_local._folder(str(tmp_path / "missing"))


@on_linux_cluster
def test_the_whole_copy_into_a_cluster(laptop, tmp_path, monkeypatch):
    """Files land in the cluster folder, the project joins the list, and the chats are filed under the cluster's
    path with their insides moved too, with their subagents and edit history."""
    from hpc_hub.api.methods import projects_copy, projects_local
    cluster_home = tmp_path / "cluster-home"
    (cluster_home / "project").mkdir(parents=True)
    events, added = [], []
    dst = SimpleNamespace(ssh=LocalShell(), connected=True, cfg=SimpleNamespace(id="wulver", short_name="Wulver",
                                                                                name="Wulver (NJIT)"))
    fake_hub = SimpleNamespace(connected=lambda c: dst, emit=lambda name, data: events.append(data))
    monkeypatch.setattr(projects_local, "hub", lambda: fake_hub)
    monkeypatch.setattr(projects_copy, "hub", lambda: fake_hub)
    monkeypatch.setattr(projects_local, "_add", lambda p: added.append(p))
    monkeypatch.setenv("HOME", str(cluster_home))  # the stand-in cluster's $HOME (LocalShell runs bash here)

    plan = projects_local.local_plan(str(laptop.project))
    assert {c["id"] for c in plan["chats"]} == {"c1", "c2"} and plan["name"] == "thesis"
    assert [x["name"] for x in plan["parts"]] == ["results", "data.bin", "src"]
    got = projects_local.local_copy(str(laptop.project), "wulver", "~/project", skip=["results"], chats=["c1", "c2"])
    end = time.time() + 20
    while time.time() < end and not all(any(e["id"] == i and e["finished"] for e in events)
                                        for i in (got["id"], got["chats"])):
        time.sleep(0.05)
    assert not [e for e in events if e["error"]], events
    dest = cluster_home / "project" / "thesis"
    assert (dest / "src" / "a.py").read_text() == "print('hi')\n" and not (dest / "results").exists()
    assert added and added[0].path == str(dest) and added[0].cluster == "wulver"
    there = os.path.realpath(dest)
    c1 = cluster_home / ".claude/projects" / project_dir(there) / "c1.jsonl"
    c2 = cluster_home / ".claude/projects" / project_dir(there + "/src") / "c2.jsonl"
    assert json.loads(c1.read_text().splitlines()[0])["cwd"] == there
    assert f"Edited {there}/a.py" in c1.read_text()
    assert json.loads(c2.read_text().splitlines()[0])["cwd"] == there + "/src"
    assert (c1.parent / "c1" / "agent-1.jsonl").exists()
    assert (cluster_home / ".claude/file-history/c1/a.py@v1").read_text() == "old\n"
    assert not list((cluster_home / ".claude/projects").glob("*/c3.jsonl")), "another project's chat never goes"
    with pytest.raises(ValueError, match="already exists"):
        projects_local.local_copy(str(laptop.project), "wulver", "~/project")
