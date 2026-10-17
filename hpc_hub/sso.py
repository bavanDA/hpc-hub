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

# One step per call: email page -> Next, password page -> Sign in. Returns what it did.
STEP_JS = """
(function (u, p, doneUser, donePass) {
  const shown = el => el && el.offsetParent !== null && !el.disabled;
  const pick = sel => [...document.querySelectorAll(sel)].find(shown);
  const set = (el, v) => {
    el.focus();
    // native setter, so React/Knockout pages (Okta, Microsoft) see the value
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  };
  const submit = el => {
    const btn = pick('#idSIButton9, button[type=submit], input[type=submit]');
    if (btn) btn.click();
    else if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
  };
  const user = pick('input[name=loginfmt], input[type=email], input[name=username], ' +
                    'input#username, input[name=j_username], input[name=identifier]');
  const pw = pick('input[type=password]');
  if (pw && p && !donePass) {
    if (user && u && !user.value) set(user, u);
    set(pw, p); submit(pw); return 'pass';
  }
  if (!pw && user && u && !doneUser) { set(user, u); submit(user); return 'user'; }
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


class AutoFill:
    """Fills username, then password, once each, on whatever sign-in page the view shows."""

    def __init__(self, view: WebKit.WebView, username: str, password: str, on_sent=lambda: None):
        self.view, self.username, self.password, self.on_sent = view, username, password, on_sent
        self.done = {"user": False, "pass": False}
        self.timer = 0

    def page_loaded(self) -> None:
        if self.password and not self.timer and not self.done["pass"]:
            self.timer = GLib.timeout_add(800, self._step)

    def _step(self) -> bool:
        if self.done["pass"]:
            self.timer = 0
            return False
        script = STEP_JS % (json.dumps(self.username), json.dumps(self.password),
                            json.dumps(self.done["user"]), json.dumps(self.done["pass"]))
        self.view.evaluate_javascript(script, -1, None, None, None, self._stepped, None)
        return True

    def _stepped(self, view, result, _data) -> None:
        try:
            did = view.evaluate_javascript_finish(result).to_string()
        except GLib.Error:
            return
        if did in self.done:
            self.done[did] = True
            if did == "pass":
                self.on_sent()


class SsoWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application, url: str):
        super().__init__(application=app, title="VPN sign-in", default_width=520, default_height=720)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.status = Gtk.Label(label="Signing in… approve the Duo push on your phone when it arrives.")
        self.status.set_wrap(True)
        self.status.set_margin_top(8)
        self.status.set_margin_bottom(8)
        box.append(self.status)

        self.view = WebKit.WebView()
        self.view.set_vexpand(True)
        self.view.connect("load-changed", self.on_load)
        box.append(self.view)
        self.set_child(box)
        self.fill = AutoFill(self.view, ask_app("hpc-hub:sso-username") or "", ask_app("hpc-hub:sso-password") or "",
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
    app = Gtk.Application(application_id=None)
    app.connect("activate", lambda a: SsoWindow(a, url).present())
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
