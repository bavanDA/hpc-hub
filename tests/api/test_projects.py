import json
import subprocess
import time

import pytest

from hpc_hub.agents.chats import Chat
from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import projects as api
from hpc_hub.core import config
from hpc_hub.core.config import ClusterConfig
from hpc_hub.globus.api import TaskInfo
from hpc_hub.projects import store
from hpc_hub.projects.store import Project
from tests.helpers import LocalShell


class FakeSession:
    def __init__(self, cid, name, connected=True, collection=""):
        self.cfg = ClusterConfig(cid, name)
        self.cfg.globus.collection_id = collection
        self.ssh, self.connected = LocalShell(), connected


class FakeHub:
    def __init__(self, *sessions):
        self.sessions = {s.cfg.id: s for s in sessions}
        self.events = []

    def emit(self, name, data):
        self.events.append((name, data))

    def session(self, cluster):
        return self.sessions[cluster]

    def connected(self, cluster):
        s = self.sessions[cluster]
        if not s.connected:
            raise RuntimeError(f"Connect to {s.cfg.name} first")
        return s


@pytest.fixture
def hub(tmp_path, monkeypatch):
    """Two connected clusters and one that is not; the store and settings in tmp, $HOME too (LocalShell)."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(store, "PROJECTS_FILE", tmp_path / "projects.toml")
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "app.toml")
    monkeypatch.setattr(api, "_places", {})
    monkeypatch.setattr(api, "_homes", {})
    monkeypatch.setattr(api, "_synced", {})
    monkeypatch.setattr(api, "sync_soon", lambda cluster: None)  # tests call api.sync themselves
    h = FakeHub(FakeSession("wulver", "Wulver"), FakeSession("yale", "Yale"), FakeSession("sdsc", "Expanse", False))
    monkeypatch.setattr(hub_mod, "_hub", h)
    return h


def _finished(h, tid, seconds=10):
    end = time.time() + seconds
    while time.time() < end:
        done = [d for n, d in h.events if n == "transfer" and d["id"] == tid and d["finished"]]
        if done and tid not in api._running:
            return done[-1]
        time.sleep(0.02)
    raise AssertionError(f"{tid} did not finish")


def test_add_checks_the_folder_and_finds_papers(hub, tmp_path):
    paper = tmp_path / "home" / "paper"
    paper.mkdir()
    (paper / "main.tex").write_text("\\documentclass{article}\n")
    got = api.add(" paper ", "wulver", "~/paper")
    assert got["path"] == str(paper) and got["latex"] and got["cluster_name"] == "Wulver"
    with pytest.raises(RuntimeError, match="No folder"):
        api.add("x", "wulver", "~/missing")
    with pytest.raises(ValueError, match="already"):
        api.add("again", "wulver", str(paper))
    with pytest.raises(ValueError, match="name"):
        api.add(" ", "wulver", "~")
    # not connected: kept as typed, checked when you open it
    assert api.add("sims", "sdsc", "~/sims")["path"] == "~/sims"


def test_list_hides_papers_while_experimental(hub, tmp_path):
    store.save([Project("paper", "wulver", "/p", main_tex="main.tex", opened=1),
                Project("thesis", "yale", "/t", kind="code", opened=9)], store.PROJECTS_FILE)
    got = api.list_projects()
    assert [p["name"] for p in got["projects"]] == ["thesis", "paper"] and not got["experimental"]
    assert {c["id"]: c["connected"] for c in got["clusters"]} == {"wulver": True, "yale": True, "sdsc": False}
    config.APP_FILE.write_text("[app]\nexperimental = true\n")
    got = api.list_projects()
    assert got["experimental"] and [p["name"] for p in got["projects"]] == ["thesis"]


def test_create_update_remove(hub, tmp_path):
    p = api.create("wulver", "~/work", "My thesis", "LaTeX paper", git=False)
    folder = tmp_path / "home" / "work" / "My-thesis"
    assert p["path"] == str(folder) and (folder / "main.tex").exists() and p["latex"]
    with pytest.raises(RuntimeError, match="exist"):
        api.create("wulver", "~/work", "My thesis", "Empty", git=False)
    with pytest.raises(RuntimeError, match="Connect to Expanse"):
        api.create("sdsc", "~", "x")
    (tmp_path / "home" / "other").mkdir()
    q = api.update(p["id"], "thesis", "wulver", "~/other")
    assert q["name"] == "thesis" and q["path"].endswith("/other") and not q["main_tex"]
    api.opened("thesis")
    assert store.load(store.PROJECTS_FILE)[0].opened > 0
    api.remove(q["id"])
    assert api.list_projects()["projects"] == [] and folder.exists()  # the folder stays


def test_status_reads_git_of_every_project_at_once(hub, tmp_path, monkeypatch):
    home = tmp_path / "home"
    repo, plain, tilde = home / "thesis", home / "notes", home / "paper"
    for d in (repo, plain, tilde):
        d.mkdir()
    for d in (repo, tilde):
        subprocess.run(["git", "init", "-q", "-b", "main", str(d)], check=True)
    (repo / "a.py").write_text("x")
    (repo / "b.py").write_text("y")
    store.save([Project("thesis", "wulver", str(repo)), Project("notes", "wulver", str(plain)),
                Project("paper", "wulver", "~/paper"), Project("sims", "sdsc", "/s")], store.PROJECTS_FILE)
    commands = []
    run = hub.sessions["wulver"].ssh.run
    monkeypatch.setattr(hub.sessions["wulver"].ssh, "run", lambda c, **k: commands.append(c) or run(c, **k))
    got = api.status("wulver")
    assert got == {str(repo): {"branch": "main", "changed": 2}, "~/paper": {"branch": "main", "changed": 0}}
    assert len([c for c in commands if "git" in c]) == 1  # one ssh command for all of them
    assert api.status("sdsc") == {} and api.status("yale") == {}


def test_browse_lists_folders_only(hub, tmp_path):
    home = tmp_path / "home"
    for d in ("b", "a", ".hidden"):
        (home / d).mkdir()
    (home / "file.txt").write_text("x")
    got = api.browse("wulver", "~")
    assert got["path"] == str(home) and got["folders"] == [".hidden", "a", "b"]
    api.mkdir("wulver", str(home / "a" / "new"))
    assert api.browse("wulver", str(home / "a" / ".."))["path"] == str(home)
    assert api.browse("wulver", "~/a")["folders"] == ["new"]
    with pytest.raises(RuntimeError, match="Connect"):
        api.browse("sdsc", "~")
    assert api.places("wulver")["storage"][0] == {"label": "Home", "path": "~"}


def _project(tmp_path):
    src = tmp_path / "home" / "proj"
    (src / "code").mkdir(parents=True)
    (src / "code" / "run.py").write_text("print(1)\n")
    (src / "data").mkdir()
    (src / "data" / "big.bin").write_bytes(b"0" * 50000)
    store.save([Project("proj", "wulver", str(src))], store.PROJECTS_FILE)
    return src


def test_copy_plan_sizes_and_chats(hub, tmp_path, monkeypatch):
    src = _project(tmp_path)
    found = [Chat("c1", str(src), "Fix the run", "", "", 1, 300), Chat("c2", str(src / "code"), "", "Hi", "", 1, 9),
             Chat("c3", "/elsewhere", "Other", "", "", 1, 5)]
    monkeypatch.setattr(api.chat_list, "list_chats", lambda ssh, agent, limit, full_size=False: found)
    got = api.copy_plan("proj")
    assert [x["name"] for x in got["parts"]] == ["data", "code"] and got["parts"][0]["size"] >= 50000
    assert [c["id"] for c in got["chats"]] == ["c1", "c2"] and got["chats"][1]["name"] == "Hi"
    with pytest.raises(RuntimeError, match="Connect"):
        store.save([Project("s", "sdsc", "/x")], store.PROJECTS_FILE)
        api.copy_plan("s")


def test_copy_through_the_laptop_leaves_out_what_you_skip(hub, tmp_path):
    _project(tmp_path)
    targets = api.copy_targets("proj")["targets"]
    assert [t["id"] for t in targets] == ["wulver", "yale", "sdsc"] and targets[0]["same"]
    assert "Globus app id" in targets[1]["globus_missing"]
    got = api.copy("proj", "yale", str(tmp_path / "there"), skip=["data"])
    last = _finished(hub, got["id"])
    assert not last["error"] and last["status"].startswith("Done") and got["chats"] == ""
    assert (tmp_path / "there" / "proj" / "code" / "run.py").exists()
    assert not (tmp_path / "there" / "proj" / "data").exists()
    assert store.load(store.PROJECTS_FILE)[0].copy_to == "yale"
    with pytest.raises(RuntimeError, match="Globus needs"):
        api.copy("proj", "yale", "~", how="globus")


class FakeGlobus:
    logged_in = True

    def __init__(self):
        self.asked, self.submitted = 0, None

    def path_for(self, collection, real):
        return real

    def submit(self, *args, **kw):
        self.submitted = (args, kw)
        return "task1"

    def task(self, task_id):
        self.asked += 1
        status = "SUCCEEDED" if self.asked > 1 else "ACTIVE"
        return TaskInfo(status, 2000, self.asked, 2, 0, "")

    def cancel(self, task_id):
        pass


def test_globus_sync_is_polled_into_transfer_events(hub, tmp_path, monkeypatch):
    src = _project(tmp_path)
    hub.sessions["wulver"].cfg.globus.collection_id = "a"
    hub.sessions["yale"].cfg.globus.collection_id = "b"
    client = FakeGlobus()
    monkeypatch.setattr(api, "_globus_client", lambda: client)
    monkeypatch.setattr(api, "GLOBUS_POLL", 0.01)
    got = api.copy("proj", "yale", "/dest", how="globus", skip=["data"])
    last = _finished(hub, got["id"])
    args, kw = client.submitted
    assert args[:4] == ("a", str(src), "b", "/dest/proj") and kw == {"sync_level": 2, "skip": ["data"]}
    assert last["status"] == "Done · 2.0 kB · 2 files" and last["done"] == 2 and not last["error"]
    assert any(d["status"].startswith("Copying") for n, d in hub.events if d.get("id") == got["id"])


def test_cancel_stops_a_running_copy(hub, monkeypatch):
    def slow(p, report):
        p.cancelled.wait(5)
        raise RuntimeError("stopped")
    tid = api._start("t", slow)
    api.cancel_copy(tid)
    last = _finished(hub, tid)
    assert last["status"] == "Cancelled" and last["error"] == "Cancelled"


def test_projects_are_shared_through_the_cluster(hub, tmp_path):
    (tmp_path / "home" / "thesis").mkdir()
    (tmp_path / "home" / "old").mkdir()
    api.add("thesis", "wulver", "~/thesis")
    api.add("old", "wulver", "~/old")
    api.sync("wulver")
    shared = tmp_path / "home" / ".hpc-hub" / "projects.json"
    assert [r["name"] for r in json.loads(shared.read_text())["projects"]] == ["old", "thesis"]

    # the phone renames thesis and removes old; this side hears it on the next sync
    data = json.loads(shared.read_text())
    later = int(time.time()) + 5
    data["projects"] = [{**r, "name": "Thesis 2", "updated": later} for r in data["projects"] if r["name"] == "thesis"]
    data["removed"] = {str(tmp_path / "home" / "old"): later}
    shared.write_text(json.dumps(data))
    assert api.sync("wulver") and ("projects", {"cluster": "wulver"}) in hub.events
    assert [p.name for p in store.load(store.PROJECTS_FILE)] == ["Thesis 2"]

    # removed here: it leaves the shared file too, and does not come back
    api.remove(f"wulver:{tmp_path / 'home' / 'thesis'}")
    api.sync("wulver")
    assert json.loads(shared.read_text())["projects"] == [] and not store.load(store.PROJECTS_FILE)


def test_a_cluster_that_is_not_connected_is_left_alone(hub):
    assert api.sync("sdsc") is False


def test_copy_into_another_group_on_the_same_cluster(hub, tmp_path):
    _project(tmp_path)
    got = api.copy("proj", "wulver", str(tmp_path / "groupB"), skip=["data"])
    last = _finished(hub, got["id"])
    assert not last["error"] and last["status"].startswith("Done")
    assert (tmp_path / "groupB" / "proj" / "code" / "run.py").exists()
    assert not (tmp_path / "groupB" / "proj" / "data").exists()
    with pytest.raises(ValueError, match="outside the project"):
        api.copy("proj", "wulver", str(tmp_path / "home" / "proj" / "code"))
