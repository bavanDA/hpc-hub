"""The HPC Hub Chrome window, against a fake Chrome (tests/connect/fake_bin/chrome) that speaks the DevTools
protocol over the pipe (Linux, macOS) and over the port's websocket (Windows). No real browser, no real site."""

import json
import os
import sys
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.connect import chrome_window as cw
from hpc_hub.connect.vpn_sso import SsoStart

FAKE = str(Path(__file__).parent / "fake_bin" / "chrome")
START = SsoStart("https://vpn.example.edu", "https://vpn.example.edu/+CSCOE+/saml/sp/login?tgname=x",
                 "https://vpn.example.edu/+CSCOE+/saml_ac_login.html", "acSamlv2Token", "acSamlv2Error", "<opaque/>")


@pytest.fixture(params=["pipe", "port"])
def command(request, monkeypatch):
    """How to start the fake, with the module set to that transport. The pipe needs posix_spawn."""
    if request.param == "pipe" and sys.platform == "win32":
        pytest.skip("the pipe is for Linux and macOS")
    monkeypatch.setattr(cw, "PORT", request.param == "port")
    return [sys.executable, FAKE] if request.param == "port" else FAKE


@pytest.fixture
def fake(tmp_path, monkeypatch, command):
    """Runs sign_in against the fake; gives back the result and what Chrome was asked."""
    log = tmp_path / "chrome.log"
    monkeypatch.setenv("FAKE_CHROME_LOG", str(log))
    monkeypatch.setattr(cw, "POLL", 0.02)

    def run(cancelled=lambda: False, timeout=10, **env):
        for k, v in env.items():
            monkeypatch.setenv(f"FAKE_CHROME_{k.upper()}", str(v))
        log.write_text("")
        result = cw.sign_in(START, cancelled, timeout, binary=command, folder=tmp_path / "profile")
        lines = [json.loads(x) for x in log.read_text().splitlines()]
        return result, lines[0], [m for m, _ in lines[1:]], lines[1:]
    return run


def test_token_is_picked_up_and_the_window_closed(fake):
    (token, err), argv, methods, calls = fake(after=3)
    assert (token, err) == ("tok-new", "")
    assert argv[0].startswith("--user-data-dir=") and argv[0].endswith("profile")
    flag = "--remote-debugging-port=0" if cw.PORT else "--remote-debugging-pipe"
    assert {flag, "--no-first-run", "--no-default-browser-check"} <= set(argv)
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
    assert "open already" in fake(quit=1)[0][1]  # another of our windows took the page and this one quit
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


def test_protocol_errors_and_missing_chrome(command, tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_CHROME_LOG", str(tmp_path / "log"))
    win = cw.Window(command, tmp_path / "p")
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


@pytest.mark.skipif(sys.platform == "win32", reason="Unix modes; %APPDATA% is already private")
def test_profile_folder_is_private(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    d = cw.profile_dir()
    assert d == tmp_path / "hpc-hub" / "web" / "chrome" and (os.stat(d).st_mode & 0o777) == 0o700


def test_cookie_domains():
    assert cw._matches("vpn.example.edu", "vpn.example.edu") and cw._matches(".example.edu", "vpn.example.edu")
    assert not cw._matches(".ample.edu", "vpn.example.edu") and not cw._matches("evil.edu", "vpn.example.edu")


def test_the_port_file(tmp_path):
    f = tmp_path / cw.PORT_FILE
    assert cw.read_port_file(f) is None  # not written yet
    f.write_text("5")
    assert cw.read_port_file(f) is None  # half written
    f.write_text("49152\n/devtools/browser/0a1b-2c3d\n")
    assert cw.read_port_file(f) == (49152, "/devtools/browser/0a1b-2c3d")


def test_a_stale_port_file_is_not_trusted(tmp_path, monkeypatch):
    """A file left by a crashed window points at a port that is gone (or someone else's): removed first, so the
    fake's fresh one is the one used."""
    monkeypatch.setenv("FAKE_CHROME_LOG", str(tmp_path / "log"))
    monkeypatch.setattr(cw, "PORT", True)
    (tmp_path / "p").mkdir()
    (tmp_path / "p" / cw.PORT_FILE).write_text("1\n/devtools/browser/old")
    win = cw.Window([sys.executable, FAKE], tmp_path / "p")
    assert win.call("Target.getTargets")["targetInfos"]
    win.close()


def test_offered_where_chrome_can_be_driven(monkeypatch):
    monkeypatch.setattr(cw.browser, "chrome", lambda: "chrome")
    monkeypatch.setattr(cw, "PORT", True)
    assert cw.available()  # Windows: the port
    monkeypatch.setattr(cw, "PORT", False)
    assert cw.available() == hasattr(os, "posix_spawn")  # elsewhere: the pipe
    monkeypatch.setattr(cw.browser, "chrome", lambda: "")
    assert not cw.available()
