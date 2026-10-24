"""VPN web sign-in from the backend's side: where to sign in, the app's window, and a Chrome profile. Fakes only:
no Chrome, no keyring, no VPN server."""

import json
import re
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.api.hub import Hub
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


def test_pick_browser_offers_the_app_window_and_chrome_profiles(hub, monkeypatch):
    monkeypatch.setattr(browser, "chrome", lambda: "")
    assert hub.pick_browser(wulver()) == ""  # no Chrome: the app's window, nothing asked
    assert hub.events == []

    monkeypatch.setattr(browser, "chrome", lambda: "/usr/bin/google-chrome")
    monkeypatch.setattr(browser, "profiles", lambda: [browser.Profile("Default", "Home"),
                                                      browser.Profile("Profile 2", "Uni", "jdoe@example.edu")])
    s = wulver()
    s.cfg.vpn.browser = "Uni"
    for answer, want in (("Uni", "Uni"), ("", ""), (None, None), ("Elsewhere", None)):
        t, out = run(hub.pick_browser, s)
        q = next_question(hub)
        assert q["kind"] == "pick-browser" and q["default"] == "Uni"
        assert q["profiles"] == [{"name": "Home", "email": ""}, {"name": "Uni", "email": "jdoe@example.edu"}]
        hub.answer(q["id"], answer)
        t.join(5)
        assert out["result"] == want
        hub.events.clear()


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


@pytest.fixture
def chrome(monkeypatch):
    """A Chrome with one profile; the token cookie shows up when cookie["token"] is set."""
    from hpc_hub.connect import chrome_cookies
    opened, cookie, asked = [], {}, []
    monkeypatch.setattr(browser, "profiles", lambda: [browser.Profile("Profile 2", "Uni")])
    monkeypatch.setattr(browser, "open_url", lambda url, name: opened.append((url, name)) or True)

    def wait_for(folder, host, name, since, cancelled, timeout=600):
        asked.append((folder, host, name))
        while not cancelled():
            if cookie.get("token"):
                return cookie["token"]
            time.sleep(0.01)
        return ""
    monkeypatch.setattr(chrome_cookies, "wait_for", wait_for)
    return opened, cookie, asked


def test_chrome_profile_picks_up_the_token(hub, chrome):
    opened, cookie, asked = chrome
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), "uni")
    q = next_question(hub)
    assert q["kind"] == "browser-login" and q["profile"] == "Uni"
    assert opened == [(START.login_url, "Uni")]
    hub.answer(q["id"], "again")
    q2 = next_question(hub, wait_done(hub, q["id"]))
    assert q2["kind"] == "browser-login" and len(opened) == 2
    cookie["token"] = "tok-from-chrome"
    t.join(5)
    assert out["result"] == ("tok-from-chrome", "")
    assert asked == [("Profile 2", "vpn.example.edu", "acSamlv2Token")]
    wait_done(hub, q2["id"])
    no_secret_in(hub.events)


def test_chrome_profile_can_switch_to_the_app_window_or_cancel(hub, chrome):
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), "Uni")
    q = next_question(hub)
    hub.answer(q["id"], "in-app")
    q2 = next_question(hub, wait_done(hub, q["id"]))
    assert q2["kind"] == "web-login"
    hub.answer(q2["id"], None)
    t.join(5)
    assert out["result"] == ("", "Sign-in cancelled")

    hub.events.clear()
    t, out = run(hub.web_login, wulver(), START, Login("jdoe", SECRET), "Uni")
    hub.answer(next_question(hub)["id"], None)
    t.join(5)
    assert out["result"] == ("", "Sign-in cancelled")
    assert hub.web_login(wulver(), START, Login("jdoe", ""), "Nobody") == ("", "No Chrome profile named Nobody")


def _rust_const(name: str) -> str:
    rs = (Path(__file__).parents[2] / "app" / "src-tauri" / "src" / "sso.rs").read_text()
    m = re.search(rf'const {name}: &str = r#"(.*?)"#;', rs, re.S)
    assert m, f"{name} not found in sso.rs"
    return m.group(1)


def test_sign_in_window_uses_the_same_fill_script():
    """sso.rs carries a copy of STEP_JS (the GTK app's), with the four values as %s like here."""
    from hpc_hub.connect.sso import STEP_JS
    assert _rust_const("STEP_JS").strip() == STEP_JS.strip()
