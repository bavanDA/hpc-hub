"""Adding this computer's key through the portal, with a fake portal, sign-in window and keyring."""

import time

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import keysetup
from hpc_hub.connect import chrome_window, ood
from hpc_hub.core import config, credentials
from hpc_hub.core.credentials import Login

KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTests jdoe@laptop"


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


class FakePortal:
    keys: list = []

    def __init__(self, url, cookies):
        self.session = cookies.get(ood.SESSION)

    def signed_in(self):
        return ("jdoe", "/home/jdoe", "csrf123") if self.session == "ok" else ("", "", "")

    def add_key(self, home, csrf, key):
        if key in self.keys:
            return False
        self.keys.append(key)
        return True


@pytest.fixture
def setup(monkeypatch, tmp_path):
    h = Hub.__new__(Hub)
    h.sessions = {c.id: Session(c) for c in config.default_clusters()}
    windows = []  # (title, note, where) of each sign-in window shown
    answer = {"token": "ok", "error": ""}

    def web_login(s, start, login, where="", title="", note=""):
        windows.append((title, note, where, start.login_url, login.password))
        return answer["token"], answer["error"]
    h.web_login = web_login
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(keysetup, "_jobs", {})
    monkeypatch.setattr(keysetup.my_key.Path, "home", lambda: tmp_path)
    monkeypatch.setattr(chrome_window, "available", lambda: False)
    (tmp_path / ".ssh").mkdir()
    (tmp_path / ".ssh" / "id_ed25519").write_text("private")
    (tmp_path / ".ssh" / "id_ed25519.pub").write_text(KEY + "\n")
    FakePortal.keys = []
    monkeypatch.setattr(ood, "Portal", FakePortal)
    store = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: store.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: store.__setitem__((c, k), login))
    return windows, answer, store


def wait_state(cluster, *states):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        got = keysetup.status(cluster)
        if got["state"] in states:
            return got
        time.sleep(0.01)
    raise AssertionError(keysetup.status(cluster))


def test_key_goes_on_after_signing_in_in_a_window_of_ours(setup):
    windows, _, store = setup
    keysetup.start("sdsc")
    got = wait_state("sdsc", "done")
    assert got["user"] == "jdoe" and "Key added" in got["text"]
    assert FakePortal.keys == [KEY] and store["sdsc", "ssh"] == Login("jdoe", "")
    title, note, where, url, password = windows[0]
    assert title == "SDSC Expanse portal sign-in" and note == keysetup.NOTE and where == ""  # no Chrome: the app's
    assert url == "https://portal.expanse.sdsc.edu/pun/sys/dashboard" and password == ""  # nothing filled in

    store["sdsc", "ssh"] = Login("jdoe", "kept")
    keysetup.start("sdsc")  # again: the key is there already, the saved password for jdoe stays
    got = wait_state("sdsc", "done")
    assert "already" in got["text"] and FakePortal.keys == [KEY] and store["sdsc", "ssh"] == Login("jdoe", "kept")


def test_no_portal_no_key_and_errors(setup, tmp_path):
    _, answer, store = setup
    with pytest.raises(ValueError, match="no web portal"):
        keysetup.start("wulver")
    answer.update(token="", error="Sign-in cancelled")
    keysetup.start("sdsc")
    got = wait_state("sdsc", "failed")
    assert got["title"] == "Could not finish" and got["text"] == "Sign-in cancelled" and not store

    (tmp_path / ".ssh" / "id_ed25519.pub").unlink()
    keysetup.start("sdsc")
    assert wait_state("sdsc", "failed")["title"] == "No SSH key on this computer"


def test_stop(setup):
    import threading
    _, _, store = setup
    gate = threading.Event()  # the sign-in window stays open until the test has pressed Stop
    h = hub_mod._hub
    shown = h.web_login
    h.web_login = lambda *a, **k: (gate.wait(5), shown(*a, **k))[1]
    keysetup.start("sdsc")
    keysetup.stop("sdsc")
    assert keysetup.status("sdsc")["state"] == "stopped"
    gate.set()
    time.sleep(0.05)
    assert keysetup.status("sdsc")["state"] == "stopped" and not store
