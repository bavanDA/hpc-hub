import json
import stat
import time

import pytest

from hpc_hub.agents import lock
from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import permissions as m
from hpc_hub.core.config import ClusterConfig
from tests.helpers import LocalShell


class Shell(LocalShell):
    username = "jdoe"


class Session:
    def __init__(self):
        self.cfg, self.ssh = ClusterConfig("wulver", "Wulver"), Shell()


class FakeHub:
    def __init__(self):
        self.session = Session()

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError("Connect to Yale first")
        return self.session


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(hub_mod, "_hub", FakeHub())
    m._setups.clear()
    return tmp_path


def test_fresh_cluster_shows_the_suggested_list(home):
    got = m.get("wulver")
    assert got["name"] == "Wulver" and "grep" in got["allowed"] and got["trash"] and got["accept_edits"]
    assert got["groups"][0]["title"] == "Read and search" and got["asks"][0]["key"] == "scancel"
    assert got["lock"] == {"set_up": False, "locked": False, "config": {}, "open": 0, "log": []}
    assert "settings" not in got  # it can hold API keys
    with pytest.raises(RuntimeError, match="Connect"):
        m.get("yale")


def test_save_keeps_other_settings_and_mode_600(home):
    (home / ".claude").mkdir()
    (home / ".claude" / "settings.json").write_text(json.dumps({"env": {"API_KEY": "abc123"}}))
    got = m.save("wulver", ["git", "conda", "rm", " "], trash=True, ask=["scancel", "bogus"], accept_edits=False)
    assert got["allowed"] == ["conda", "git"] and got["custom"] == ["conda"] and got["ask"] == ["scancel"]
    assert not got["accept_edits"]
    path = home / ".claude" / "settings.json"
    s = json.loads(path.read_text())
    assert s["env"] == {"API_KEY": "abc123"} and "Bash(rm:*)" in s["permissions"]["deny"]
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert (home / ".claude" / "hooks" / "guard.py").exists() and (home / ".local" / "bin" / "trash").exists()


def test_lock_setup_configure_and_off(home):
    start = m.lock_start("wulver")
    secret = m._setups[start["id"]][1]
    assert start["key"].replace(" ", "") == secret
    with pytest.raises(ValueError, match="doesn't match"):
        m.lock_finish(start["id"], "000000x")
    m.lock_finish(start["id"], lock.rl.code_at(secret, int(time.time() // 30)))
    assert start["id"] not in m._setups
    got = m.save("wulver", ["git"], lock_config={"minutes": 999, "tries": 4, "logout": False, "scancel": True})
    assert got["lock"]["set_up"] and got["lock"]["config"]["minutes"] == 240 and got["lock"]["config"]["tries"] == 4
    settings = json.loads((home / ".claude" / "settings.json").read_text())
    assert "remote-lock" in json.dumps(settings["hooks"])  # saving kept the lock's hook
    m.lock_reset("wulver")
    m.lock_off("wulver")
    assert not m.get("wulver")["lock"]["set_up"]


@pytest.mark.parametrize("line, words", [
    ("2026-10-24 09:12:03 ok main (open 10 min)", "Oct 24, 09:12 · Code accepted, open for 10 min"),
    ("2026-10-23 18:40:00 wrong code 1 of 3 in main", "Oct 23, 18:40 · Wrong code, 1 of 3"),
    ("2026-10-22 11:05:09 set up", "Oct 22, 11:05 · Lock turned on"),
    ("2026-10-22 11:06:00 set minutes=5", "Oct 22, 11:06 · Lock settings changed"),
    ("something else", "something else"),
])
def test_activity_in_words(line, words):
    assert m.activity(line) == words
