"""The key methods the login step uses: show, make once, test with the cluster's host."""

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
