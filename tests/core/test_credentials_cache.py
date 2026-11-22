"""Logins found in the keyring are kept in memory, so the keyring (a new D-Bus connection each time on Linux) is
asked once per login."""

import pytest

from hpc_hub.core import credentials
from hpc_hub.core.credentials import SSH, VPN, Login


class FakeKeyring:
    """Stands in for _store, _lookup and _clear and counts the calls."""

    def __init__(self, monkeypatch):
        self.items: dict = {}
        self.lookups = 0
        self.fail: Exception | None = None  # the next calls raise this (a locked keyring, D-Bus gone)
        self.during_lookup = None  # runs inside a lookup, before it answers
        monkeypatch.setattr(credentials, "_store", self.store)
        monkeypatch.setattr(credentials, "_lookup", self.lookup)
        monkeypatch.setattr(credentials, "_clear", self.clear)

    @staticmethod
    def key(attrs):
        return tuple(sorted(attrs.items()))

    def store(self, attrs, label, secret):
        if self.fail:
            raise self.fail
        self.items[self.key(attrs)] = secret

    def lookup(self, attrs):
        self.lookups += 1
        if self.fail:
            raise self.fail
        found = self.items.get(self.key(attrs))
        if self.during_lookup:
            run, self.during_lookup = self.during_lookup, None
            run()
        return found

    def clear(self, attrs):
        if self.fail:
            raise self.fail
        self.items.pop(self.key(attrs), None)

    def put(self, cluster, kind, login: Login):
        """As if another program (or an unlock) made the login appear in the keyring."""
        import json
        self.items[self.key({"cluster": cluster, "kind": kind})] = json.dumps(
            {"username": login.username, "password": login.password})


@pytest.fixture
def ring(monkeypatch):
    return FakeKeyring(monkeypatch)


def test_the_second_load_is_kept_from_the_first(ring):
    ring.put("demo", SSH, Login("jdoe", "pw"))
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
    assert ring.lookups == 1


def test_a_load_after_a_save_answers_the_new_login_without_the_keyring(ring):
    ring.put("demo", SSH, Login("jdoe", "old"))
    credentials.load("demo", SSH)
    credentials.save("demo", SSH, Login("jdoe", "new"))
    assert credentials.load("demo", SSH) == Login("jdoe", "new")
    assert ring.lookups == 1
    assert ring.items[ring.key({"cluster": "demo", "kind": SSH})]  # the keyring has it too


def test_a_load_after_a_clear_answers_none(ring):
    credentials.save("demo", SSH, Login("jdoe", "pw"))
    credentials.clear("demo", SSH)
    assert credentials.load("demo", SSH) is None
    assert ring.lookups == 1  # nothing kept: the keyring was asked


def test_other_kinds_and_clusters_are_kept_apart(ring):
    ring.put("demo", SSH, Login("jdoe", "a"))
    ring.put("demo", VPN, Login("jdoe-vpn", "b"))
    ring.put("demo2", SSH, Login("jroe", "c"))
    assert credentials.load("demo", SSH) == Login("jdoe", "a")
    assert credentials.load("demo", VPN) == Login("jdoe-vpn", "b")
    assert credentials.load("demo2", SSH) == Login("jroe", "c")
    assert ring.lookups == 3
    credentials.save("demo", VPN, Login("jdoe-vpn", "new"))
    credentials.clear("demo2", SSH)
    assert credentials.load("demo", SSH) == Login("jdoe", "a")  # untouched, still kept
    assert credentials.load("demo", VPN) == Login("jdoe-vpn", "new")
    assert credentials.load("demo2", SSH) is None
    assert ring.lookups == 4


def test_nothing_found_is_asked_again(ring):
    """None may be a locked keyring or a dismissed unlock, not only no login: it is never kept."""
    assert credentials.load("demo", SSH) is None
    ring.put("demo", SSH, Login("jdoe", "pw"))  # unlocked now, or saved by another program
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
    assert ring.lookups == 2


def test_a_failed_lookup_is_not_kept(ring):
    ring.put("demo", SSH, Login("jdoe", "pw"))
    ring.fail = RuntimeError("Cannot autolaunch D-Bus without X11")
    with pytest.raises(RuntimeError):
        credentials.load("demo", SSH)
    ring.fail = None
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
    assert ring.lookups == 2


def test_a_failed_save_or_clear_keeps_nothing_old(ring):
    ring.put("demo", SSH, Login("jdoe", "old"))
    credentials.load("demo", SSH)
    ring.fail = RuntimeError("The keyring is locked")
    with pytest.raises(RuntimeError):
        credentials.save("demo", SSH, Login("jdoe", "new"))
    ring.fail = None
    assert credentials.load("demo", SSH) == Login("jdoe", "old")  # what the keyring really has
    assert ring.lookups == 2
    ring.fail = RuntimeError("The keyring is locked")
    with pytest.raises(RuntimeError):
        credentials.clear("demo", SSH)
    ring.fail = None
    assert credentials.load("demo", SSH) == Login("jdoe", "old")
    assert ring.lookups == 3


def test_forgetting_a_whole_cluster_drops_all_its_logins(ring):
    for cluster, kind in (("demo", SSH), ("demo", VPN), ("demo2", SSH)):
        ring.put(cluster, kind, Login("jdoe", "pw"))
        credentials.load(cluster, kind)
    credentials._forget({"cluster": "demo"})
    assert credentials._cache == {(("cluster", "demo2"), ("kind", SSH)): ring.items[(("cluster", "demo2"),
                                                                                     ("kind", SSH))]}


def test_a_lookup_that_a_save_overtook_is_not_kept(ring):
    """A load that read the old login while a save went in must not leave the old one kept."""
    ring.put("demo", SSH, Login("jdoe", "old"))
    ring.during_lookup = lambda: credentials.save("demo", SSH, Login("jdoe", "new"))
    assert credentials.load("demo", SSH) == Login("jdoe", "old")  # it read before the save
    assert credentials.load("demo", SSH) == Login("jdoe", "new")


def test_the_loaded_login_is_a_fresh_copy(ring):
    credentials.save("demo", SSH, Login("jdoe", "pw"))
    got = credentials.load("demo", SSH)
    got.password = "changed by a caller"
    assert credentials.load("demo", SSH) == Login("jdoe", "pw")
