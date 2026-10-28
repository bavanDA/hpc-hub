"""Adding this computer's key through the portal, with a fake portal, Chrome and keyring."""

import time

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import keysetup
from hpc_hub.connect.ood import PortalError
from hpc_hub.core import browser, config, credentials
from hpc_hub.core.credentials import Login

KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTests jdoe@laptop"


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


class FakePortal:
    signed = {}  # profile name -> username once signed in
    keys: list = []
    fail = ""

    def __init__(self, url, profile="", cookies=None):
        self.url, self.profile, self.cookies = url, profile, cookies

    def signed_in(self):
        if self.cookies is not None:  # the phone's in-app sign-in
            user = "jdoe" if self.cookies.get("mod_auth_openidc_session") == "ok" else ""
            return (user, f"/home/{user}", "csrf123") if user else ("", "", "")
        user = self.signed.get(self.profile, "")
        return (user, f"/home/{user}", "csrf123") if user else ("", "", "")

    def add_key(self, home, csrf, key):
        if self.fail:
            raise PortalError(self.fail)
        if key in self.keys:
            return False
        self.keys.append(key)
        return True


@pytest.fixture
def setup(monkeypatch, tmp_path):
    h = Hub.__new__(Hub)
    h.sessions = {c.id: Session(c) for c in config.default_clusters()}
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(keysetup, "_jobs", {})
    monkeypatch.setattr(keysetup, "POLL", 0.01)
    monkeypatch.setattr(keysetup.Path, "home", lambda: tmp_path)
    (tmp_path / ".ssh").mkdir()
    (tmp_path / ".ssh" / "id_ed25519.pub").write_text(KEY + "\n")
    FakePortal.signed, FakePortal.keys, FakePortal.fail = {}, [], ""
    monkeypatch.setattr(keysetup, "Portal", FakePortal)
    monkeypatch.setattr(browser, "profiles", lambda: [browser.Profile("Default", "Home"),
                                                      browser.Profile("Profile 2", "Uni")])
    opened = []
    monkeypatch.setattr(keysetup, "_open", lambda url, profile="": opened.append((url, profile)))
    store = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: store.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: store.__setitem__((c, k), login))
    return opened, store


def wait_state(cluster, *states):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        got = keysetup.status(cluster)
        if got["state"] in states:
            return got
        time.sleep(0.01)
    raise AssertionError(keysetup.status(cluster))


def test_key_goes_on_once_chrome_is_signed_in(setup):
    opened, store = setup
    assert keysetup.start("sdsc")["state"] == "waiting"
    assert keysetup.start("sdsc")["state"] == "waiting"  # a second start keeps the same wait
    time.sleep(0.05)
    assert opened == [("https://portal.expanse.sdsc.edu", "")]  # opened once, not every look
    FakePortal.signed["Uni"] = "jdoe"
    got = wait_state("sdsc", "done")
    assert got["user"] == "jdoe" and "Key added" in got["text"]
    assert FakePortal.keys == [KEY]
    assert store["sdsc", "ssh"] == Login("jdoe", "")

    store["sdsc", "ssh"] = Login("jdoe", "kept")
    keysetup.start("sdsc")  # again: the key is there already, the saved password for jdoe stays
    got = wait_state("sdsc", "done")
    assert "already" in got["text"] and FakePortal.keys == [KEY] and store["sdsc", "ssh"] == Login("jdoe", "kept")


def test_no_portal_no_key_and_errors(setup, tmp_path):
    with pytest.raises(ValueError, match="no web portal"):
        keysetup.start("wulver")
    FakePortal.signed["Home"] = "jdoe"
    FakePortal.fail = "The portal refused to save .ssh/authorized_keys (HTTP 403)"
    keysetup.start("sdsc")
    got = wait_state("sdsc", "failed")
    assert got["title"] == "Could not finish" and "403" in got["text"]

    (tmp_path / ".ssh" / "id_ed25519.pub").unlink()
    keysetup.start("sdsc")
    assert wait_state("sdsc", "failed")["title"] == "No SSH key on this computer"


def test_stop_and_open(setup, monkeypatch):
    opened, store = setup
    keysetup.start("sdsc")
    keysetup.stop("sdsc")
    assert keysetup.status("sdsc")["state"] == "stopped"
    FakePortal.signed["Uni"] = "jdoe"
    time.sleep(0.05)
    assert keysetup.status("sdsc")["state"] == "stopped" and not store and not FakePortal.keys
    keysetup.open_portal("sdsc", "Uni")
    assert opened[-1] == ("https://portal.expanse.sdsc.edu", "Uni")
    with pytest.raises(ValueError, match="No Chrome profile"):
        keysetup.open_portal("sdsc", "Nobody")
    monkeypatch.setattr(browser, "chrome", lambda: "/usr/bin/google-chrome")
    assert keysetup.profiles() == ["Home", "Uni"]


def test_device_key_is_for_a_key_page(monkeypatch):
    monkeypatch.setattr(keysetup.ssh_keys, "ensure", lambda: KEY)
    assert keysetup.device_key() == KEY
    yale = next(c for c in config.default_clusters() if c.id == "yale")
    assert yale.key_page.startswith("https://")


def test_phone_adds_its_key_with_the_sign_in_pages_cookies(setup, monkeypatch):
    _, store = setup
    monkeypatch.setattr(keysetup.ssh_keys, "ensure", lambda: KEY)
    assert keysetup.with_cookies("sdsc", {"mod_auth_openidc_session": "ok", "other": "x"}) == \
        {"user": "jdoe", "added": True}
    assert FakePortal.keys == [KEY] and store[("sdsc", credentials.SSH)] == Login("jdoe", "")
    assert keysetup.with_cookies("sdsc", {"mod_auth_openidc_session": "ok"})["added"] is False
    with pytest.raises(PortalError, match="did not let you in"):
        keysetup.with_cookies("sdsc", {"mod_auth_openidc_session": "expired"})
