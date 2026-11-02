"""Saving the logins and key from a scanned desktop code on the phone."""

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import pairing as methods
from hpc_hub.core import config, credentials, pairing, ssh_keys
from hpc_hub.core.credentials import Login
from hpc_hub.core.pairing import Code, Entry


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def store(monkeypatch, tmp_path):
    h = Hub.__new__(Hub)
    h.clusters = config.default_clusters()
    h.sessions = {c.id: Session(c) for c in h.clusters}
    h.save_clusters = lambda: None
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(ssh_keys.Path, "home", lambda: tmp_path)
    saved = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: saved.__setitem__((c, k), login))
    return saved


def test_apply_saves_the_logins_and_key(store):
    seed = ssh_keys.new()
    text = pairing.code(Code([Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True),
                              Entry("elsewhere", "x")], seed))
    assert methods.apply(text) == ["Wulver (NJIT)", "SDSC Expanse"]
    assert store == {("wulver", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", "")}
    assert ssh_keys.key_path().with_name("id_ed25519.pub").read_text().strip() == ssh_keys.public_line(seed)


class KeySsh:
    def __init__(self, fail=""):
        self.ran, self.fail = [], fail

    def run(self, command, timeout=60, fast=None):
        import subprocess
        self.ran.append(command)
        return subprocess.CompletedProcess(command, 1 if self.fail else 0, "", self.fail)


def test_make_puts_a_key_on_clusters_that_take_keys(store):
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    store["sdsc", "ssh"] = Login("jdoe2", "")
    sdsc = hub_mod._hub.sessions["sdsc"]
    sdsc.connected, sdsc.ssh = True, KeySsh()
    got = methods.make(["wulver", "sdsc", "elsewhere"])
    assert got["clusters"] == ["Wulver (NJIT)", "SDSC Expanse"] and got["skipped"] == []
    (line,) = sdsc.ssh.ran
    assert "authorized_keys" in line and ssh_keys.COMMENT in line
    back = pairing.parse(got["text"])
    assert back.key and [e.key for e in back.entries] == [False, True] and back.entries[0].password == "s3cret"
    assert len(got["matrix"]) == len(got["matrix"][0]) and set("".join(got["matrix"])) == {"0", "1"}
    assert got["svg"].startswith("<svg") and 'fill="#000"' in got["svg"]
    nopw = pairing.parse(methods.make(["wulver"], passwords=False)["text"])
    assert nopw.entries[0].password == "" and not nopw.key


def test_make_skips_a_key_cluster_it_cannot_reach(store):
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    store["sdsc", "ssh"] = Login("jdoe2", "")
    hub_mod._hub.sessions["sdsc"].connected = False
    got = methods.make(["wulver", "sdsc"])
    assert got["clusters"] == ["Wulver (NJIT)"] and "Connect it first" in got["skipped"][0]["reason"]
    sdsc = hub_mod._hub.sessions["sdsc"]
    sdsc.connected, sdsc.ssh = True, KeySsh(fail="Disk quota exceeded")
    with pytest.raises(pairing.PairingError, match="Disk quota"):
        methods.make(["sdsc"])
    store.clear()
    with pytest.raises(pairing.PairingError, match="No saved logins"):
        methods.make()


def test_apply_needs_a_known_cluster(store):
    with pytest.raises(pairing.PairingError, match="no login"):
        methods.apply(pairing.code(Code([Entry("elsewhere", "x")])))
    assert not ssh_keys.key_path().exists()


def test_apply_saves_a_vpn_login_of_its_own(store):
    seed = ssh_keys.new()
    methods.apply(pairing.code(Code([Entry("yale", "jd123", key=True, vpn_user="jane.doe@example.edu",
                                           vpn_password="vpnpass")], seed)))
    assert store == {("yale", "ssh"): Login("jd123", ""), ("yale", "vpn"): Login("jane.doe@example.edu", "vpnpass")}
