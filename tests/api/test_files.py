import base64
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import files, files_copy
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
    monkeypatch.setattr(files_copy, "_transfers", {})
    return fake



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


def test_real_path_follows_links(h, tmp_path):
    (tmp_path / "mmfs1-scratch" / "myproject").mkdir(parents=True)
    (tmp_path / "scratch").symlink_to(tmp_path / "mmfs1-scratch")
    assert files.real_path("wulver", str(tmp_path / "scratch/myproject/")) == str(tmp_path / "mmfs1-scratch/myproject")


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


def test_mkdir_rename_delete(h, tmp_path):
    (tmp_path / "notes.md").write_text("# hi\n")
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
    plan = files_copy.copy_plan("wulver", str(tmp_path / "proj"))
    assert plan["sizes"][0]["name"] == "data" and plan["total"] >= 5000
    (tmp_path / "proj").rename(tmp_path / "old")
    files.extract("wulver", str(archive))
    assert (tmp_path / "proj" / "a.txt").read_text() == "a"
