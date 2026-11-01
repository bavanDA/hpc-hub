"""code.* methods over a made-up connected cluster that runs commands locally."""

import sys
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import code
from tests.helpers import LocalShell

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="the stand-in cluster needs GNU tools; "
                                                                "clusters run Linux")


class FakeHub:
    def __init__(self):
        self.s = SimpleNamespace(cfg=SimpleNamespace(id="wulver", name="Wulver"), ssh=LocalShell(), connected=True)

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError("Connect to SDSC first")
        return self.s


@pytest.fixture(autouse=True)
def fake_hub(monkeypatch, tmp_path):
    monkeypatch.setattr(hub_module, "_hub", FakeHub())
    monkeypatch.setenv("HOME", str(tmp_path))


def test_open_save_stat_by_home_path(tmp_path):
    (tmp_path / "proj").mkdir()
    (tmp_path / "proj" / "train.py").write_text("epochs = 3\n")
    o = code.open_file("wulver", "~/proj/train.py")
    assert o["path"] == "~/proj/train.py" and o["text"] == "epochs = 3\n" and o["writable"]
    r = code.save("wulver", "~/proj/train.py", "epochs = 5\n", o["sha"], o["eol"])
    assert r["saved"] and (tmp_path / "proj" / "train.py").read_text() == "epochs = 5\n"
    again = code.save("wulver", "~/proj/train.py", "epochs = 9\n", o["sha"])
    assert again["conflict"] and again["sha"] == r["sha"]
    [s] = code.stat("wulver", ["~/proj/train.py"])
    assert s["path"] == "~/proj/train.py" and s["exists"] and s["sha"] == r["sha"]


def test_new_file_find_and_grep(tmp_path):
    made = code.new_file("wulver", "~/test_train.py", "def test_lr():\n    assert True\n")
    assert made["path"] == "~/test_train.py" and made["writable"]
    assert [f["name"] for f in code.find_files("wulver", "~", "test_")] == ["test_train.py"]
    assert code.grep("wulver", "", "test_lr")[0]["line"] == 1


def test_not_connected():
    with pytest.raises(RuntimeError, match="Connect"):
        code.open_file("sdsc", "~/x.py")
