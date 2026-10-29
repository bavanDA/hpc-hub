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


def test_apply_needs_a_known_cluster(store):
    with pytest.raises(pairing.PairingError, match="no login"):
        methods.apply(pairing.code(Code([Entry("elsewhere", "x")])))
    assert not ssh_keys.key_path().exists()
