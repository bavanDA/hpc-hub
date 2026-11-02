import time
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import files, files_local
from tests.helpers import LocalShell


class FakeHub:
    """One 'cluster' that runs commands and copies locally; events are kept."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.s = SimpleNamespace(cfg=SimpleNamespace(id="wulver", name="Wulver", short_name="Wulver"), ssh=LocalShell(), connected=True)

    def connected(self, cluster):
        if cluster != "wulver" or not self.s.connected:
            raise RuntimeError("Connect to Wulver first")
        return self.s

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


def test_upload_files_and_folders(h, tmp_path):
    (tmp_path / "a.txt").write_text("hello")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "b.csv").write_text("1,2,3")
    remote = tmp_path / "remote"
    remote.mkdir()
    tid = files_local.upload("wulver", [str(tmp_path / "a.txt"), str(tmp_path / "data")], str(remote))["id"]
    t = _wait(h, tid)
    assert (t["error"], t["done"], t["total"], t["how"]) == ("", 10, 10, "laptop")
    assert t["title"] == f"2 items: this computer → Wulver:{remote}"
    assert (remote / "a.txt").read_text() == "hello" and (remote / "data" / "b.csv").read_text() == "1,2,3"
    assert any(x["id"] == tid for x in files.transfers())


def test_upload_needs_something_that_is_there(h, tmp_path):
    with pytest.raises(ValueError):
        files_local.upload("wulver", [], str(tmp_path))
    with pytest.raises(FileNotFoundError):
        files_local.upload("wulver", [str(tmp_path / "nope")], str(tmp_path))
    h.s.connected = False
    with pytest.raises(RuntimeError, match="Connect"):
        files_local.upload("wulver", [str(tmp_path)], str(tmp_path))


def test_download_never_overwrites(h, tmp_path):
    src = tmp_path / "remote" / "run.out"
    src.parent.mkdir()
    src.write_text("done")
    local = tmp_path / "Downloads" / "HPC Hub"
    first = files_local.download("wulver", str(src), str(local))
    assert first["path"] == str(local / "run.out")
    assert _wait(h, first["id"])["error"] == ""
    second = files_local.download("wulver", str(src), str(local))
    t = _wait(h, second["id"])
    assert second["path"] == str(local / "run (1).out")
    assert (local / "run (1).out").read_text() == "done" and t["done"] == t["total"] == 4


def test_download_a_folder(h, tmp_path):
    (tmp_path / "remote" / "results").mkdir(parents=True)
    (tmp_path / "remote" / "results" / "x.txt").write_text("x")
    got = files_local.download("wulver", str(tmp_path / "remote" / "results") + "/", str(tmp_path / "here"))
    assert _wait(h, got["id"])["error"] == ""
    assert (tmp_path / "here" / "results" / "x.txt").read_text() == "x"


def test_cancel_stops_the_copy_and_drops_the_half_file(h, tmp_path, monkeypatch):
    src = tmp_path / "big.bin"
    src.write_text("x")
    monkeypatch.setattr(h.s.ssh, "copy_argv", lambda a, b: ["bash", "-c", f"echo part > '{b}'; exec sleep 30"],
                        raising=False)
    got = files_local.download("wulver", str(src), str(tmp_path / "here"))
    end = time.monotonic() + 5
    while not (tmp_path / "here" / "big.bin").exists() and time.monotonic() < end:
        time.sleep(0.02)
    start = time.monotonic()
    files.cancel_transfer(got["id"])
    t = _wait(h, got["id"])
    assert t["error"] == "Cancelled" and t["status"] == "Cancelled"
    assert time.monotonic() - start < 3
    assert not (tmp_path / "here" / "big.bin").exists()


def test_a_failed_copy_says_why(h, tmp_path, monkeypatch):
    monkeypatch.setattr(h.s.ssh, "copy_argv", lambda a, b: ["bash", "-c", "echo 'No such file' >&2; exit 1"],
                        raising=False)
    t = _wait(h, files_local.download("wulver", "/nope/a.txt", str(tmp_path))["id"])
    assert t["error"] == "No such file"


def test_free_name():
    from pathlib import Path
    assert files_local.free_name(Path("/nonexistent"), "a.tar") == Path("/nonexistent/a.tar")


def test_free_name_counts_up(tmp_path):
    (tmp_path / ".bashrc").write_text("")
    (tmp_path / "notes.txt").write_text("")
    (tmp_path / "notes (1).txt").write_text("")
    assert files_local.free_name(tmp_path, "notes.txt").name == "notes (2).txt"
    assert files_local.free_name(tmp_path, ".bashrc").name == ".bashrc (1)"
