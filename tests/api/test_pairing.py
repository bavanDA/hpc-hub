"""Saving the logins from a scanned desktop code on the phone."""

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import pairing as methods
from hpc_hub.core import config, credentials, pairing
from hpc_hub.core.credentials import Login


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def store(monkeypatch):
    h = Hub.__new__(Hub)
    h.clusters = config.default_clusters()
    h.sessions = {c.id: Session(c) for c in h.clusters}
    h.save_clusters = lambda: None
    monkeypatch.setattr(hub_mod, "_hub", h)
    saved = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: saved.__setitem__((c, k), login))
    return saved


def test_apply_saves_the_logins(store):
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    store["sdsc", "ssh"] = Login("jdoe2", "")
    text, _ = pairing.code(["wulver", "sdsc", "elsewhere"])
    store.clear()
    assert methods.apply(text) == ["Wulver (NJIT)", "SDSC Expanse"]
    assert store == {("wulver", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", "")}


def test_apply_needs_a_known_cluster(store):
    with pytest.raises(pairing.PairingError, match="no login"):
        methods.apply(pairing.code([])[0])
