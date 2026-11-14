"""The key methods the login step uses: show, make once, test with the cluster's host."""

import stat
import sys
import types

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import keys
from hpc_hub.core import config, login_copy, my_key


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def home(monkeypatch, tmp_path):
    h = Hub.__new__(Hub)
    h.sessions = {c.id: Session(c) for c in config.default_clusters()}
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(my_key.Path, "home", lambda: tmp_path)
    return tmp_path


def test_mine_create_once(home):
    assert keys.mine() is None
    made = keys.create()
    assert made["kind"] == "ed25519" and made["public"].startswith("ssh-ed25519 ")
    assert keys.create() == made == keys.mine()  # a second create gives the same key


def test_use_a_key_you_already_have(home):
    h = hub_mod._hub
    h.save_clusters = lambda: setattr(h, "saved", True)
    mine = home / "keys" / "lab_ed25519"
    mine.parent.mkdir()
    mine.write_text("private")
    (home / "keys" / "lab_ed25519.pub").write_text("ssh-ed25519 AAAAC3 jdoe@lab\n")
    got = keys.use("yale", str(mine))
    assert got["file"] == "lab_ed25519" and h.sessions["yale"].cfg.ssh_key == str(mine) and h.saved
    assert keys.mine("yale")["public"] == "ssh-ed25519 AAAAC3 jdoe@lab"
    assert keys.mine() is None  # other clusters still use ssh's own keys (none here)
    with pytest.raises(ValueError):
        keys.use("yale", str(home / "nothing"))


def test_qr_of_the_public_key(home):
    assert keys.qr() is None
    keys.create()
    svg = keys.qr()
    assert svg.startswith("<svg ") and 'fill="#000"' in svg  # dark on light, the same drawing as the pairing code


def test_use_a_picked_copy_keeps_it(home):
    h = hub_mod._hub
    h.save_clusters = lambda: None
    picked = home / "cache" / "lab_ed25519"
    picked.parent.mkdir()
    made = my_key.create()  # a real private key to pick; the app's own stays
    picked.write_text(my_key.Path(made.path).read_text())
    got = keys.use("yale", str(picked), temporary=True)
    kept = home / ".ssh" / "lab_ed25519"
    assert got["file"] == "lab_ed25519" and h.sessions["yale"].cfg.ssh_key == str(kept) and not picked.exists()
    assert stat.S_IMODE(kept.stat().st_mode) == 0o600
    picked.write_text(kept.read_text())
    assert keys.use("yale", str(picked), temporary=True)["file"] == "lab_ed25519-1"  # never over another file
    junk = home / "cache" / "notes.txt"
    junk.write_text("not a key")
    with pytest.raises(ValueError):
        keys.use("yale", str(junk), temporary=True)
    assert junk.exists()  # refused: left alone


def test_test_needs_a_key_and_a_name_then_asks_the_cluster(home, monkeypatch):
    with pytest.raises(ValueError):
        keys.test("yale", "jdoe")  # no key yet: the screen never asks then
    keys.create()
    with pytest.raises(ValueError):
        keys.test("yale", " ")
    asked = []

    def fake(key, user, host, port, who, vpn):
        asked.append((user, host, port, who, vpn))
        return my_key.Result("ok", who)
    monkeypatch.setattr(my_key, "test", fake)
    got = keys.test("yale", " jdoe ")
    assert (got["ok"], got["kind"], got["reason"], got["text"]) == (True, "ok", "ok", login_copy.TEST["ok"])
    assert asked == [("jdoe", "bouchet.ycrc.yale.edu", 22, "Yale", True)]


class FakeMaster:
    """asyncssh's login as test_asyncssh sees it: what it asks, then how it ends."""
    prompts: list[str] = []
    ends: Exception | None = None
    last = None

    def __init__(self, cfg, user, env, log, ask):
        FakeMaster.last = self
        self.cfg, self.user, self.ask, self.stopped = cfg, user, ask, False

    def start(self, timeout):
        for p in self.prompts:
            self.ask(p)
        if self.ends:
            raise self.ends

    def stop(self):
        self.stopped = True


@pytest.mark.parametrize("prompts, ends, reason", [
    ([], None, "ok"),  # the key alone was enough
    (["Duo two-factor login for jdoe"], "Permission denied", "ok"),  # the key is in, Duo comes next
    (["Password:"], "Permission denied", "not_yet"),
    ([], "Permission denied", "not_yet"),
    ([], "connect to host bouchet port 22: No route to host", "no_vpn"),
    ([], "SSH login timed out", "no_vpn"),
])
def test_no_ssh_program_checks_through_asyncssh(home, monkeypatch, prompts, ends, reason):
    class SshError(Exception):
        pass
    fake = types.SimpleNamespace(AsyncSshMaster=FakeMaster, SshError=SshError)
    # both places: "from . import ssh_async" takes the package's attribute when the real module was loaded before
    # (asyncssh installed, as on GitHub), and sys.modules only when it wasn't
    import hpc_hub.core
    monkeypatch.setitem(sys.modules, "hpc_hub.core.ssh_async", fake)
    monkeypatch.setattr(hpc_hub.core, "ssh_async", fake, raising=False)
    monkeypatch.setattr(FakeMaster, "prompts", prompts)
    monkeypatch.setattr(FakeMaster, "ends", SshError(ends) if ends else None)
    monkeypatch.setattr(my_key.subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError()))
    keys.create()
    assert keys.test("yale", "jdoe")["reason"] == reason
    assert FakeMaster.last.cfg.ssh_key.endswith("id_ed25519") and FakeMaster.last.user == "jdoe"
