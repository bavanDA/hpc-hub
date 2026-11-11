import os
import subprocess
import threading
import time
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import files_copy as copies
from hpc_hub.globus.api import TaskInfo
from tests.helpers import LocalShell, on_linux_cluster

pytestmark = on_linux_cluster


class FakeHub:
    """Two 'clusters' that both run commands locally; events are kept."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.sessions = {c: SimpleNamespace(cfg=SimpleNamespace(id=c, name=c.title(), short_name=c.title(),
            globus=SimpleNamespace(collection_id=f"col-{c}")), ssh=LocalShell(), connected=True)
            for c in ("wulver", "yale")}
        self.sessions["sdsc"] = SimpleNamespace(cfg=SimpleNamespace(id="sdsc", name="Expanse", short_name="Expanse",
            globus=SimpleNamespace(collection_id="")), ssh=None, connected=False)

    def session(self, cluster):
        return self.sessions[cluster]

    def connected(self, cluster):
        s = self.sessions[cluster]
        if not s.connected:
            raise RuntimeError(f"Connect to {s.cfg.name} first")
        return s

    def emit(self, name, data):
        self.events.append((name, data))


@pytest.fixture
def h(monkeypatch):
    fake = FakeHub()
    monkeypatch.setattr(hub_module, "_hub", fake)
    monkeypatch.setattr(copies, "_transfers", {})
    return fake


def _wait(h, tid, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        done = [d for n, d in h.events if n == "transfer" and d["id"] == tid and d["finished"]]
        if done:
            return done[-1]
        time.sleep(0.02)
    raise AssertionError("transfer did not finish")


def test_copy_through_laptop_with_progress(h, tmp_path, monkeypatch):
    monkeypatch.setattr(copies, "UPDATE_EVERY", 0)
    src = tmp_path / "a" / "proj"
    (src / "big").mkdir(parents=True)
    (src / "big" / "x.bin").write_bytes(b"0" * 3_000_000)
    (src / "keep.txt").write_text("ok")
    tid = copies.copy("wulver", str(src), "yale", str(tmp_path / "b"), skip=["big"])["id"]
    last = _wait(h, tid)
    assert last["status"].startswith("Done") and not last["error"] and last["title"].startswith("proj: Wulver")
    assert (tmp_path / "b" / "proj" / "keep.txt").read_text() == "ok" and not (tmp_path / "b" / "proj" / "big").exists()
    assert copies.transfers()[0]["id"] == tid
    copies.cancel_transfer(tid)  # finished: it leaves the list
    assert copies.transfers() == []


def test_copy_failure_and_same_cluster(h, tmp_path):
    tid = copies.copy("wulver", str(tmp_path / "nope"), "yale", str(tmp_path / "d"))["id"]
    assert _wait(h, tid)["status"].startswith("Failed")
    (tmp_path / "f.txt").write_text("x")
    (tmp_path / "into").mkdir()
    tid = copies.copy("wulver", str(tmp_path / "f.txt"), "wulver", str(tmp_path / "into"))["id"]
    last = _wait(h, tid)
    assert last["how"] == "cluster" and last["status"] == "Done" and (tmp_path / "into" / "f.txt").exists()
    with pytest.raises(RuntimeError, match="Connect to Expanse"):
        copies.copy("sdsc", "/x/y", "yale", "/z")


class FakeGlobus:
    def __init__(self, steps):
        self.steps, self.submitted, self.cancelled = list(steps), [], []
        self.logged_in = True

    def path_for(self, collection, real):
        return real

    def submit(self, *args, **kw):
        self.submitted.append((args, kw))
        return "task-1"

    def task(self, task_id):
        return self.steps.pop(0) if len(self.steps) > 1 else self.steps[0]

    def cancel(self, task_id):
        self.cancelled.append(task_id)


def test_globus_copy_polls_until_done(h, monkeypatch):
    monkeypatch.setattr(copies, "GLOBUS_POLL", 0)
    client = FakeGlobus([TaskInfo("ACTIVE", 0, 0, 0, 0, ""), TaskInfo("ACTIVE", 2000, 1, 4, 1000, ""),
                         TaskInfo("SUCCEEDED", 5000, 4, 4, 0, "")])
    monkeypatch.setattr(copies, "_globus_client", lambda: client)
    tid = copies.copy("wulver", "/home/jdoe/proj", "yale", "/home/jdoe/in", skip=["big"], how="globus")["id"]
    last = _wait(h, tid)
    args, kw = client.submitted[0]
    assert args[:4] == ("col-wulver", "/home/jdoe/proj", "col-yale", "/home/jdoe/in/proj") and args[5] is True
    assert kw == {"sync_level": 2, "skip": ["big"]}
    assert last["status"] == "Done · 5.0 kB · 4 files" and last["done"] == 4 and not last["error"]
    statuses = [d["status"] for n, d in h.events if n == "transfer"]
    assert "Counting files · 0 bytes" in statuses and "Copying · 2.0 kB · 1 of 4 files · 1.0 kB/s" in statuses


def test_globus_cancel_and_missing_collection(h, monkeypatch):
    monkeypatch.setattr(copies, "GLOBUS_POLL", 0.01)
    client = FakeGlobus([TaskInfo("ACTIVE", 0, 0, 3, 0, "")])
    monkeypatch.setattr(copies, "_globus_client", lambda: client)
    tid = copies.copy("wulver", "/home/jdoe/a.txt", "yale", "/home/jdoe", how="globus", folder=False)["id"]
    while not any(d["status"].startswith("Copying") for n, d in h.events):
        time.sleep(0.01)
    copies.cancel_transfer(tid)
    assert client.cancelled == ["task-1"]
    client.steps = [TaskInfo("FAILED", 0, 0, 3, 0, "", cancelled=True)]
    last = _wait(h, tid)
    assert last["status"] == "Cancelled" and last["error"] == "Cancelled"
    with pytest.raises(RuntimeError, match="Globus collection of Expanse"):
        copies.copy("sdsc", "/x/y", "yale", "/z", how="globus")


def test_cancel_a_copy_through_laptop(h, tmp_path, monkeypatch):
    started = threading.Event()
    real = copies.transfer.copy

    def slow(src, s, dst, d, progress, on_update, skip, total):
        started.set()
        progress.cancelled.wait(5)
        return real(src, s, dst, d, progress, on_update, skip, total)
    monkeypatch.setattr(copies.transfer, "copy", slow)
    (tmp_path / "x.txt").write_text("x")
    tid = copies.copy("wulver", str(tmp_path / "x.txt"), "yale", str(tmp_path / "out"), folder=False)["id"]
    started.wait(5)
    copies.cancel_transfer(tid)
    last = _wait(h, tid)
    assert last["status"] == "Cancelled" and last["finished"]


def test_running_globus_copies_are_picked_up(monkeypatch):
    events = []
    monkeypatch.setattr(copies, "hub", lambda: type("H", (), {"emit": staticmethod(lambda n, d: events.append(d))})())
    monkeypatch.setattr(copies, "_resumed", False)
    monkeypatch.setattr(copies, "_transfers", {})
    monkeypatch.setattr(copies.config, "load_app", lambda: type("A", (), {"globus_client_id": "cid"})())

    class Client:
        logged_in = True

        def __init__(self, cid):
            pass

        def tasks(self, n):
            return [{"task_id": "t1", "label": "data to Yale", "status": "ACTIVE"},
                    {"task_id": "t0", "label": "old", "status": "SUCCEEDED"}]

        def task(self, tid):
            from hpc_hub.globus.api import TaskInfo
            return TaskInfo("SUCCEEDED", 10, 2, 2, 0, "")
    monkeypatch.setattr(copies.globus, "Globus", Client)
    first = copies.transfers()
    assert [t["title"] for t in first] == ["data to Yale · Globus"]
    assert copies.transfers() == copies.transfers() and len(copies._transfers) == 1  # once per run, no duplicates


def test_copy_on_one_cluster_copies_and_can_be_stopped(tmp_path, monkeypatch):
    monkeypatch.setattr(copies, "emit", lambda t: None)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.txt").write_text("hi")
    (tmp_path / "dst").mkdir()
    t = copies.Transfer("1", "x", "cluster")
    copies._on_cluster(t, LocalShell(), str(tmp_path / "src"), str(tmp_path / "dst"))
    assert (tmp_path / "dst" / "src" / "a.txt").read_text() == "hi" and t.status == "Done"

    monkeypatch.setattr(copies, "_cp_command", lambda s, d: "sleep 30 & echo $!; wait $!")  # a copy that takes long
    t2 = copies.Transfer("2", "x", "cluster")
    threading.Timer(0.5, t2.progress.cancelled.set).start()
    start = time.time()
    try:
        copies._on_cluster(t2, LocalShell(), "a", "b")
        raise AssertionError("should stop")
    except RuntimeError as e:
        assert str(e) == "Cancelled" and time.time() - start < 10


def test_copying_again_picks_up_where_it_stopped(tmp_path):
    src, dst = tmp_path / "src", tmp_path / "dst"
    (src / "sub").mkdir(parents=True)
    (src / "sub" / "a").write_text("one")
    dst.mkdir()
    line = copies._cp_command(str(src) + "/", str(dst))
    assert subprocess.run(["bash", "-c", line], capture_output=True, text=True).returncode == 0
    (dst / "src" / "sub" / "a").write_text("ONE")  # rsync only sends what changed: same size and time stay
    os.utime(dst / "src" / "sub" / "a", (os.path.getatime(src / "sub" / "a"), os.path.getmtime(src / "sub" / "a")))
    (src / "b").write_text("two")
    assert subprocess.run(["bash", "-c", line], capture_output=True, text=True).returncode == 0
    assert (dst / "src" / "b").read_text() == "two" and (dst / "src" / "sub" / "a").read_text() == "ONE"

