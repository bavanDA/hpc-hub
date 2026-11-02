import base64
import threading
import time
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import files
from hpc_hub.globus.api import TaskInfo
from tests.helpers import LocalShell


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
    monkeypatch.setattr(files, "_transfers", {})
    return fake


def _wait(h, tid, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        done = [d for n, d in h.events if n == "transfer" and d["id"] == tid and d["finished"]]
        if done:
            return done[-1]
        time.sleep(0.02)
    raise AssertionError("transfer did not finish")


def test_list_sorts_folders_first_and_gives_the_path(h, tmp_path):
    (tmp_path / "b.txt").write_text("hi")
    (tmp_path / "a dir").mkdir()
    got = files.list_dir("wulver", str(tmp_path) + "/")
    assert got["path"] == str(tmp_path)
    assert [(e["name"], e["kind"]) for e in got["entries"]] == [("a dir", "d"), ("b.txt", "f")]
    assert got["entries"][1]["size"] == 2 and got["entries"][1]["mtime"] > 0


def test_list_home_and_not_connected(h, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    assert files.list_dir("wulver", "")["path"] == str(tmp_path)
    with pytest.raises(RuntimeError, match="Connect to Expanse first"):
        files.list_dir("sdsc", "")


def test_read_text_cut_binary_and_image(h, tmp_path):
    (tmp_path / "run.sh").write_text("écho hi\n" * 10)
    got = files.read("wulver", str(tmp_path / "run.sh"), limit=9)
    assert got["kind"] == "text" and got["cut"] and got["text"] == "écho hi\n"
    assert not files.read("wulver", str(tmp_path / "run.sh"))["cut"]
    (tmp_path / "a.out").write_bytes(b"\x7fELF\0\0")
    assert files.read("wulver", str(tmp_path / "a.out"))["kind"] == "binary"
    (tmp_path / "plot.PNG").write_bytes(b"\x89PNG data")
    img = files.read("wulver", str(tmp_path / "plot.PNG"))
    assert img["kind"] == "image" and img["mime"] == "image/png"
    assert base64.b64decode(img["data"]) == b"\x89PNG data"
    with pytest.raises(Exception, match="larger"):
        files.read("wulver", str(tmp_path / "plot.PNG"), limit=3)


def test_write_mkdir_rename_delete(h, tmp_path):
    files.write("wulver", str(tmp_path / "notes.md"), "# hi\n")
    assert (tmp_path / "notes.md").read_text() == "# hi\n"
    made = files.mkdir("wulver", str(tmp_path), "results")
    assert made == str(tmp_path / "results") and (tmp_path / "results").is_dir()
    with pytest.raises(ValueError):
        files.mkdir("wulver", str(tmp_path), "a/b")
    assert files.rename("wulver", str(tmp_path / "notes.md"), "readme.md") == str(tmp_path / "readme.md")
    with pytest.raises(Exception, match="already exists"):
        files.rename("wulver", str(tmp_path / "readme.md"), "results")
    files.delete("wulver", str(tmp_path / "readme.md"))
    assert not (tmp_path / "readme.md").exists()
    with pytest.raises(Exception, match="Refusing"):
        files.delete("wulver", "/home")


def test_zip_extract_and_copy_plan(h, tmp_path):
    (tmp_path / "proj" / "data").mkdir(parents=True)
    (tmp_path / "proj" / "data" / "x.bin").write_bytes(b"0" * 5000)
    (tmp_path / "proj" / "a.txt").write_text("a")
    files.make_zip("wulver", str(tmp_path / "proj"))
    archive = next(p for p in tmp_path.iterdir() if p.name.startswith("proj."))
    plan = files.copy_plan("wulver", str(tmp_path / "proj"))
    assert plan["sizes"][0]["name"] == "data" and plan["total"] >= 5000
    (tmp_path / "proj").rename(tmp_path / "old")
    files.extract("wulver", str(archive))
    assert (tmp_path / "proj" / "a.txt").read_text() == "a"


def test_copy_through_laptop_with_progress(h, tmp_path, monkeypatch):
    monkeypatch.setattr(files, "UPDATE_EVERY", 0)
    src = tmp_path / "a" / "proj"
    (src / "big").mkdir(parents=True)
    (src / "big" / "x.bin").write_bytes(b"0" * 3_000_000)
    (src / "keep.txt").write_text("ok")
    tid = files.copy("wulver", str(src), "yale", str(tmp_path / "b"), skip=["big"])["id"]
    last = _wait(h, tid)
    assert last["status"].startswith("Done") and not last["error"] and last["title"].startswith("proj: Wulver")
    assert (tmp_path / "b" / "proj" / "keep.txt").read_text() == "ok" and not (tmp_path / "b" / "proj" / "big").exists()
    assert files.transfers()[0]["id"] == tid
    files.cancel_transfer(tid)  # finished: it leaves the list
    assert files.transfers() == []


def test_copy_failure_and_same_cluster(h, tmp_path):
    tid = files.copy("wulver", str(tmp_path / "nope"), "yale", str(tmp_path / "d"))["id"]
    assert _wait(h, tid)["status"].startswith("Failed")
    (tmp_path / "f.txt").write_text("x")
    (tmp_path / "into").mkdir()
    tid = files.copy("wulver", str(tmp_path / "f.txt"), "wulver", str(tmp_path / "into"))["id"]
    last = _wait(h, tid)
    assert last["how"] == "cluster" and last["status"] == "Done" and (tmp_path / "into" / "f.txt").exists()
    with pytest.raises(RuntimeError, match="Connect to Expanse"):
        files.copy("sdsc", "/x/y", "yale", "/z")


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
    monkeypatch.setattr(files, "GLOBUS_POLL", 0)
    client = FakeGlobus([TaskInfo("ACTIVE", 0, 0, 0, 0, ""), TaskInfo("ACTIVE", 2000, 1, 4, 1000, ""),
                         TaskInfo("SUCCEEDED", 5000, 4, 4, 0, "")])
    monkeypatch.setattr(files, "_globus_client", lambda: client)
    tid = files.copy("wulver", "/home/jdoe/proj", "yale", "/home/jdoe/in", skip=["big"], how="globus")["id"]
    last = _wait(h, tid)
    args, kw = client.submitted[0]
    assert args[:4] == ("col-wulver", "/home/jdoe/proj", "col-yale", "/home/jdoe/in/proj") and args[5] is True
    assert kw == {"sync_level": 2, "skip": ["big"]}
    assert last["status"] == "Done · 5.0 kB · 4 files" and last["done"] == 4 and not last["error"]
    statuses = [d["status"] for n, d in h.events if n == "transfer"]
    assert "Counting files · 0 bytes" in statuses and "Copying · 2.0 kB · 1 of 4 files · 1.0 kB/s" in statuses


def test_globus_cancel_and_missing_collection(h, monkeypatch):
    monkeypatch.setattr(files, "GLOBUS_POLL", 0.01)
    client = FakeGlobus([TaskInfo("ACTIVE", 0, 0, 3, 0, "")])
    monkeypatch.setattr(files, "_globus_client", lambda: client)
    tid = files.copy("wulver", "/home/jdoe/a.txt", "yale", "/home/jdoe", how="globus", folder=False)["id"]
    while not any(d["status"].startswith("Copying") for n, d in h.events):
        time.sleep(0.01)
    files.cancel_transfer(tid)
    assert client.cancelled == ["task-1"]
    client.steps = [TaskInfo("FAILED", 0, 0, 3, 0, "", cancelled=True)]
    last = _wait(h, tid)
    assert last["status"] == "Cancelled" and last["error"] == "Cancelled"
    with pytest.raises(RuntimeError, match="Globus collection of Expanse"):
        files.copy("sdsc", "/x/y", "yale", "/z", how="globus")


def test_cancel_a_copy_through_laptop(h, tmp_path, monkeypatch):
    started = threading.Event()
    real = files.transfer.copy

    def slow(src, s, dst, d, progress, on_update, skip, total):
        started.set()
        progress.cancelled.wait(5)
        return real(src, s, dst, d, progress, on_update, skip, total)
    monkeypatch.setattr(files.transfer, "copy", slow)
    (tmp_path / "x.txt").write_text("x")
    tid = files.copy("wulver", str(tmp_path / "x.txt"), "yale", str(tmp_path / "out"), folder=False)["id"]
    started.wait(5)
    files.cancel_transfer(tid)
    last = _wait(h, tid)
    assert last["status"] == "Cancelled" and last["finished"]


def test_running_globus_copies_are_picked_up(monkeypatch):
    from hpc_hub.api.methods import files as m
    events = []
    monkeypatch.setattr(m, "hub", lambda: type("H", (), {"emit": staticmethod(lambda n, d: events.append(d))})())
    monkeypatch.setattr(m, "_resumed", False)
    monkeypatch.setattr(m, "_transfers", {})
    monkeypatch.setattr(m.config, "load_app", lambda: type("A", (), {"globus_client_id": "cid"})())

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
    monkeypatch.setattr(m.globus, "Globus", Client)
    first = m.transfers()
    assert [t["title"] for t in first] == ["data to Yale · Globus"]
    assert m.transfers() == m.transfers() and len(m._transfers) == 1  # once per run, no duplicates


def test_copy_on_one_cluster_copies_and_can_be_stopped(tmp_path, monkeypatch):
    import threading
    import time

    from hpc_hub.api.methods import files as m
    from tests.helpers import LocalShell
    monkeypatch.setattr(m, "_emit", lambda t: None)
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.txt").write_text("hi")
    (tmp_path / "dst").mkdir()
    t = m.Transfer("1", "x", "cluster")
    m._on_cluster(t, LocalShell(), str(tmp_path / "src"), str(tmp_path / "dst"))
    assert (tmp_path / "dst" / "src" / "a.txt").read_text() == "hi" and t.status == "Done"

    monkeypatch.setattr(m, "_cp_command", lambda s, d: "sleep 30 & echo $!; wait $!")  # a copy that takes long
    t2 = m.Transfer("2", "x", "cluster")
    threading.Timer(0.5, t2.progress.cancelled.set).start()
    start = time.time()
    try:
        m._on_cluster(t2, LocalShell(), "a", "b")
        raise AssertionError("should stop")
    except RuntimeError as e:
        assert str(e) == "Cancelled" and time.time() - start < 10
