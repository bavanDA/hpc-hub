"""Web sign-in from the backend's side: where to sign in, the app's window and our Chrome window. Fakes only: no
Chrome, no VPN server."""

import json
import re
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.api.hub import Hub
from hpc_hub.connect import chrome_window
from hpc_hub.connect.session import SSO_PASS, SSO_USER
from hpc_hub.connect.vpn_sso import SsoStart
from hpc_hub.core import browser, config
from hpc_hub.core.credentials import Login

START = SsoStart("https://vpn.example.edu", "https://vpn.example.edu/+CSCOE+/saml/sp/login?tgname=x",
                 "https://vpn.example.edu/+CSCOE+/saml_ac_login.html", "acSamlv2Token", "acSamlv2Error", "<opaque/>")
SECRET = "hunter2-not-real"


class FakeAskpass:
    path = Path("/run/user/1000/hpc-hub/askpass-app.sock")

    def __init__(self):
        self.handlers = {}

    def register(self, handler):
        token = f"t{len(self.handlers)}"
        self.handlers[token] = handler
        return token

    def unregister(self, token):
        self.handlers.pop(token, None)


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def hub():
    events = []
    h = Hub.__new__(Hub)  # no askpass socket, no config from disk
    h.emit = lambda name, data: events.append((name, data))
    h.askpass = FakeAskpass()
    h._questions = {}
    h.events = events
    return h


def wulver():
    return Session(config.default_clusters()[0])


def next_question(h, after=0, timeout=5.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        for name, data in h.events[after:]:
            if name == "question":
                return data
        time.sleep(0.01)
    raise AssertionError("no question")


def wait_done(h, qid, timeout=5.0):
    """Index of the question-done event for qid, once it is out."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if ("question-done", {"id": qid}) in h.events:
            return h.events.index(("question-done", {"id": qid}))
        time.sleep(0.01)
    raise AssertionError("question not done")


def run(fn, *args):
    out = {}
    t = threading.Thread(target=lambda: out.update(result=fn(*args)), daemon=True)
    t.start()
    return t, out


def no_secret_in(events):
    assert SECRET not in json.dumps(events, default=str)


def test_pick_browser_uses_the_saved_choice_and_never_asks(hub, monkeypatch):
    s = wulver()
    monkeypatch.setattr(browser, "chrome", lambda: "/usr/bin/google-chrome")
    assert hub.pick_browser(s) == ""  # nothing saved: the app's window
    s.cfg.vpn.browser = chrome_window.CHOICE
    assert hub.pick_browser(s) == chrome_window.CHOICE
    monkeypatch.setattr(browser, "chrome", lambda: "")
    assert hub.pick_browser(s) == ""  # Chrome gone: the app's window
    assert hub.events == []  # never a question while connecting


@pytest.fixture
def window(monkeypatch):
    """Our Chrome window; it signs in when result["token"] is set, and records that it was stopped."""
    result, seen = {}, {}

    def sign_in(start, cancelled, timeout=600):
        seen["start"] = start
        while not cancelled():
            if "token" in result:
                return result["token"], result.get("err", "")
            time.sleep(0.01)
        seen["stopped"] = True
        return "", "Sign-in cancelled"
    monkeypatch.setattr(chrome_window, "sign_in", sign_in)
    return result, seen


def test_chrome_window_picks_up_the_token(hub, window):
    result, seen = window
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), chrome_window.CHOICE)
    q = next_question(hub)
    assert q["kind"] == "chrome-window" and q["cluster"] == "wulver"
    result["token"] = "tok-from-window"
    t.join(5)
    assert out["result"] == ("tok-from-window", "") and seen["start"] is START
    wait_done(hub, q["id"])
    no_secret_in(hub.events)

    hub.events.clear()
    result.update(token="", err="Account locked")
    assert hub.web_login(wulver(), START, Login("jdoe", ""), chrome_window.CHOICE) == ("", "Account locked")


def test_chrome_window_can_switch_to_the_app_window_or_cancel(hub, window):
    _, seen = window
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), chrome_window.CHOICE)
    q = next_question(hub)
    hub.answer(q["id"], "in-app")
    q2 = next_question(hub, wait_done(hub, q["id"]))
    assert q2["kind"] == "web-login"
    hub.answer(q2["id"], json.dumps({"token": "tok-in-app"}))
    t.join(5)
    assert out["result"] == ("tok-in-app", "")

    hub.events.clear()
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), chrome_window.CHOICE)
    hub.answer(next_question(hub)["id"], None)
    t.join(5)
    assert out["result"] == ("", "Sign-in cancelled")
    end = time.monotonic() + 5
    while "stopped" not in seen and time.monotonic() < end:
        time.sleep(0.01)
    assert seen["stopped"]  # the window is closed, not left open


def test_app_window_gets_the_login_from_askpass_not_the_ui(hub):
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET))
    q = next_question(hub)
    assert q["kind"] == "web-login" and q["login_url"] == START.login_url and q["final_url"] == START.final_url
    assert (q["token_cookie"], q["error_cookie"]) == ("acSamlv2Token", "acSamlv2Error")
    fill = q["fill"]
    assert fill["socket"] == str(FakeAskpass.path)
    handler = hub.askpass.handlers[fill["token"]]
    assert handler(SSO_USER) == "jdoe" and handler(SSO_PASS) == SECRET and handler("Password:") is None
    no_secret_in(hub.events)
    hub.answer(q["id"], json.dumps({"token": "tok123"}))
    t.join(5)
    assert out["result"] == ("tok123", "")
    assert hub.askpass.handlers == {}  # the password is only there while the window is open
    assert hub.events[-1] == ("question-done", {"id": q["id"]})


@pytest.mark.parametrize("answer, want", [
    (json.dumps({"token": "", "error": "Your account is locked"}), ("", "Your account is locked")),
    (None, ("", "Sign-in cancelled")),
    ("not json", ("", "Sign-in cancelled")),
    (json.dumps(["x"]), ("", "Sign-in cancelled")),
])
def test_app_window_errors(hub, answer, want):
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", ""))
    q = next_question(hub)
    assert q["fill"] is None  # nothing saved to fill in: you type it
    hub.answer(q["id"], answer)
    t.join(5)
    assert out["result"] == want


def test_a_portal_sign_in_says_what_it_is(hub):
    t, out = run(hub.web_login, wulver(), START, Login("", ""), "", "Wulver (NJIT) portal sign-in", "No password")
    q = next_question(hub)
    assert q["kind"] == "web-login" and q["title"] == "Wulver (NJIT) portal sign-in" and q["note"] == "No password"
    hub.answer(q["id"], json.dumps({"token": "session-1"}))
    t.join(5)
    assert out["result"] == ("session-1", "")


def _rust_const(name: str, path: str = "app/src-tauri/src/sso.rs") -> str:
    rs = (Path(__file__).parents[2] / path).read_text()
    m = re.search(rf'const {name}: &str = r#"(.*?)"#;', rs, re.S)
    assert m, f"{name} not found in {path}"
    return m.group(1)


def test_sign_in_window_uses_the_same_fill_script():
    """sso.rs carries a copy of STEP_JS, with the four values as %s like here."""
    pytest.importorskip("gi")
    from hpc_hub.connect.sso import STEP_JS
    assert _rust_const("STEP_JS").strip() == STEP_JS.strip()


def test_phone_sign_in_page_uses_the_desktop_scripts():
    """The phone's sign-in page (mobile websignin.rs) fills in and notes your own clicks as the desktop's does."""
    phone = "mobile/src-tauri/src/websignin.rs"
    for name in ("STEP_JS", "CLICKS_JS"):
        assert _rust_const(name, phone).strip() == _rust_const(name).strip(), name
