"""In-app browser for VPN single sign-on (SAML), started by openconnect --external-browser.

Fills the saved username/password once; you approve Duo on your phone.
Standalone: only gi + stdlib, run with python3 -I.
"""

import json
import os
import socket
import sys
from urllib.parse import urlparse

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import GLib, Gtk, WebKit  # noqa: E402

if __package__:
    from ..core import browser  # noqa: E402
    from ..core.paths import web_dir  # noqa: E402
else:  # run as a script by openconnect (bin/hpc-hub-sso)
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from hpc_hub.core import browser  # noqa: E402
    from hpc_hub.core.paths import web_dir  # noqa: E402

# One step per call: email page -> Next, password page -> Sign in. Returns what it did.
STEP_JS = """
(function (u, p, doneUser, donePass) {
  const shown = el => el && el.offsetParent !== null && !el.disabled;
  const pick = sel => [...document.querySelectorAll(sel)].find(shown);
  const set = (el, v) => {
    el.focus();
    // native setter + the events typing makes, so React/Backbone pages (Okta, Microsoft) take the value
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: v}));
    el.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, key: 'End'}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('blur'));
  };
  // press Next / Sign in a moment later, once the page has taken the value ("cannot be left blank" otherwise)
  const submit = (el, v) => setTimeout(() => {
    if (el.value !== v) set(el, v);
    const btn = pick('#idSIButton9, button[type=submit], input[type=submit]');
    if (btn) btn.click();
    else if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
  }, 700);
  const user = pick('input[name=loginfmt], input[type=email], input[name=username], ' +
                    'input#username, input[name=j_username], input[name=identifier]');
  const pw = pick('input[type=password]');
  if (pw && p && !donePass) {
    if (user && u && !user.value) set(user, u);
    set(pw, p); submit(pw, p); return 'pass';
  }
  if (!pw && user && u && !doneUser) { set(user, u); submit(user, u); return 'user'; }
  return '';
})(%s, %s, %s, %s);
"""


def ask_app(prompt: str) -> str | None:
    path = os.environ.get("HPC_HUB_ASKPASS_SOCK")
    token = os.environ.get("HPC_HUB_ASKPASS_TOKEN")
    if not path or not token:
        return None
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(30)
            s.connect(path)
            s.sendall(json.dumps({"token": token, "prompt": prompt}).encode() + b"\n")
            reply = json.loads(s.makefile("rb").readline() or b"{}")
    except (OSError, ValueError):
        return None
    return reply.get("answer") if reply.get("ok") else None


# Sign-in hosts outside the university's own site that may get the password. Okta only as the university's own
# tenant (njit.okta.com for vpn.njit.edu): anyone can make a free one.
SIGN_IN_HOSTS = ("login.microsoftonline.com", "login.microsoft.com", "accounts.google.com")


def site(host: str) -> str:
    """The part of a host name an organization owns: vpn.njit.edu -> njit.edu, vpn.ox.ac.uk -> ox.ac.uk."""
    labels = host.lower().rstrip(".").split(".")
    second = len(labels) > 2 and len(labels[-1]) == 2 and labels[-2] in ("ac", "co", "edu", "gov", "org", "net", "com")
    return ".".join(labels[-3:] if second else labels[-2:])


def may_fill(uri: str, start: str) -> bool:
    """Type the password only over https, on the sign-in start page's own site or a known sign-in host,
    so a link or redirect to another site never gets it."""
    page = urlparse(uri)
    host, home = (page.hostname or "").lower(), site(urlparse(start).hostname or "")
    if page.scheme != "https" or not host:
        return False
    okta = f"{home.split('.')[0]}.okta.com" if home else ""
    return host in (*SIGN_IN_HOSTS, okta) or bool(home) and (host == home or host.endswith("." + home))


SETTLE = 2800  # ms to wait before typing into a freshly loaded page (sign-in pages finish their scripts late)
POLL = 800


class AutoFill:
    """Fills username, then password, once each, on sign-in pages of the start page's site (see may_fill)."""

    def __init__(self, view: WebKit.WebView, start: str, username: str, password: str, on_sent=lambda: None):
        self.view, self.start, self.username, self.password, self.on_sent = view, start, username, password, on_sent
        self.done = {"user": False, "pass": False}
        self.timer = 0
        self.off = False  # you clicked a link yourself ("forgot password"...): from then on you type
        view.connect("decide-policy", self._policy)

    def _policy(self, _view, decision, kind) -> bool:
        if kind == WebKit.PolicyDecisionType.NAVIGATION_ACTION:
            action = decision.get_navigation_action()
            if action.get_navigation_type() == WebKit.NavigationType.LINK_CLICKED and action.is_user_gesture():
                self.off = True
        return False  # WebKit decides as usual

    def page_loaded(self) -> None:
        if self.password and not self.timer and not self.done["pass"]:
            self._later(SETTLE)

    def _later(self, ms: int) -> None:
        self.timer = GLib.timeout_add(ms, self._step)

    def _step(self) -> bool:
        self.timer = 0
        if self.done["pass"] or self.off:
            return False
        if not may_fill(self.view.get_uri() or "", self.start):
            self._later(POLL)  # not a page we trust with the password; it may redirect to one
            return False
        script = STEP_JS % (json.dumps(self.username), json.dumps(self.password),
                            json.dumps(self.done["user"]), json.dumps(self.done["pass"]))
        self.view.evaluate_javascript(script, -1, None, None, None, self._stepped, None)
        return False

    def _stepped(self, view, result, _data) -> None:
        try:
            did = view.evaluate_javascript_finish(result).to_string()
        except GLib.Error:
            did = ""
        if did in self.done:
            self.done[did] = True
            if did == "pass":
                self.on_sent()
                return
            self._later(SETTLE)  # after the username, let the password page settle before typing
        elif not self.timer:
            self._later(POLL)  # no field yet: look again soon


_session = None


def web_session() -> "WebKit.NetworkSession":
    """One saved browser profile for VPN sign-ins (cookies kept between runs)."""
    global _session
    if _session is None:
        d = web_dir()
        _session = WebKit.NetworkSession.new(str(d / "data"), str(d / "cache"))
        _session.get_cookie_manager().set_persistent_storage(str(d / "cookies.sqlite"),
                                                             WebKit.CookiePersistentStorage.SQLITE)
    return _session


class SsoWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application, url: str):
        super().__init__(application=app, title="VPN sign-in", default_width=520, default_height=720)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.status = Gtk.Label(label="Signing in… approve the Duo push on your phone when it arrives.")
        self.status.set_wrap(True)
        self.status.set_margin_top(8)
        self.status.set_margin_bottom(8)
        box.append(self.status)

        self.view = WebKit.WebView(network_session=web_session())
        self.view.set_vexpand(True)
        self.view.connect("load-changed", self.on_load)
        box.append(self.view)
        self.set_child(box)
        self.fill = AutoFill(self.view, url, ask_app("hpc-hub:sso-username") or "",
                             ask_app("hpc-hub:sso-password") or "",
                             lambda: self.status.set_label("Password sent. Approve Duo on your phone."))
        self.view.load_uri(url)

    def on_load(self, view: WebKit.WebView, event: WebKit.LoadEvent) -> None:
        if event != WebKit.LoadEvent.FINISHED:
            return
        uri = view.get_uri() or ""
        if urlparse(uri).hostname in ("localhost", "127.0.0.1"):
            self.status.set_label("Signed in. Connecting…")
            GLib.timeout_add(1500, self.close)
            return
        self.fill.page_loaded()


def main() -> int:
    if len(sys.argv) < 2:
        return 1
    url = sys.argv[1]
    profile = os.environ.get("HPC_HUB_BROWSER", "")
    if profile and browser.open_url(url, profile):  # you sign in in Chrome; it comes back to openconnect
        return 0
    app = Gtk.Application(application_id=None)
    app.connect("activate", lambda a: SsoWindow(a, url).present())
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
