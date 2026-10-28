"""The HPC Hub Chrome window, against a fake Chrome that speaks the pipe protocol (tests/connect/fake_bin/chrome).
No real browser, no real site."""

import json
import os
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.connect import chrome_window as cw
from hpc_hub.connect.vpn_sso import SsoStart

FAKE = str(Path(__file__).parent / "fake_bin" / "chrome")
START = SsoStart("https://vpn.example.edu", "https://vpn.example.edu/+CSCOE+/saml/sp/login?tgname=x",
                 "https://vpn.example.edu/+CSCOE+/saml_ac_login.html", "acSamlv2Token", "acSamlv2Error", "<opaque/>")


@pytest.fixture
def fake(tmp_path, monkeypatch):
    """Runs sign_in against the fake; gives back the result and what Chrome was asked."""
    log = tmp_path / "chrome.log"
    monkeypatch.setenv("FAKE_CHROME_LOG", str(log))
    monkeypatch.setattr(cw, "POLL", 0.02)

    def run(cancelled=lambda: False, timeout=10, **env):
        for k, v in env.items():
            monkeypatch.setenv(f"FAKE_CHROME_{k.upper()}", str(v))
        log.write_text("")
        result = cw.sign_in(START, cancelled, timeout, binary=FAKE, folder=tmp_path / "profile")
        lines = [json.loads(x) for x in log.read_text().splitlines()]
        return result, lines[0], [m for m, _ in lines[1:]], lines[1:]
    return run


def test_token_is_picked_up_and_the_window_closed(fake):
    (token, err), argv, methods, calls = fake(after=3)
    assert (token, err) == ("tok-new", "")
    assert argv[0].startswith("--user-data-dir=") and argv[0].endswith("profile")
    assert {"--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check"} <= set(argv)
    assert ["Target.createTarget", {"url": START.login_url}] in calls
    assert ["Target.closeTarget", {"targetId": "blank"}] in calls  # the blank tab, not the service worker
    assert ["Target.closeTarget", {"targetId": "sw"}] not in calls
    assert methods.count("Storage.getCookies") == 3 and methods[-1] == "Browser.close"


def test_a_token_from_last_time_does_not_count(fake):
    (token, _), _, methods, _ = fake(after=4, stale=1)
    assert token == "tok-new" and methods.count("Storage.getCookies") == 4


def test_error_cookie_is_the_error(fake):
    assert fake(after=2, error=1)[0] == ("", "Account locked")


def test_closing_the_window_or_cancel(fake):
    assert fake(quit=2)[0] == ("", "The Chrome window was closed")
    stop = threading.Event()
    threading.Timer(0.3, stop.set).start()
    began = time.monotonic()
    (result, _, methods, _) = fake(stop.is_set, quit=0)
    assert result == ("", "Sign-in cancelled") and time.monotonic() - began < 5
    assert methods[-1] == "Browser.close"
    assert fake(timeout=0.2)[0] == ("", "Sign-in cancelled")


def test_a_chrome_that_will_not_close_is_killed(fake, monkeypatch):
    monkeypatch.setattr(cw, "CLOSE_WAIT", 0.3)
    began = time.monotonic()
    assert fake(after=2, stubborn=1)[0] == ("tok-new", "")
    assert time.monotonic() - began < 5


def test_protocol_errors_and_missing_chrome(fake, tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_CHROME_LOG", str(tmp_path / "log"))
    win = cw.Window(FAKE, tmp_path / "p")
    with pytest.raises(cw.ChromeError, match="wasn't found"):
        win.call("Nope.fail")
    assert win.call("Storage.getCookies")["cookies"]
    win.close()
    assert cw.sign_in(START, lambda: False, binary=str(tmp_path / "no-chrome"),
                      folder=tmp_path / "p")[1].startswith("Could not start Chrome")
    monkeypatch.setattr(cw.browser, "chrome", lambda: "")
    monkeypatch.setattr(cw.shutil, "which", lambda _name: None)
    assert cw.sign_in(START, lambda: False) == ("", "Google Chrome is not installed")
    assert not cw.available()


def test_profile_folder_is_private(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    d = cw.profile_dir()
    assert d == tmp_path / "hpc-hub" / "web" / "chrome" and (os.stat(d).st_mode & 0o777) == 0o700


def test_cookie_domains():
    assert cw._matches("vpn.example.edu", "vpn.example.edu") and cw._matches(".example.edu", "vpn.example.edu")
    assert not cw._matches(".ample.edu", "vpn.example.edu") and not cw._matches("evil.edu", "vpn.example.edu")
