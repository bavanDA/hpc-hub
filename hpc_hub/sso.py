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

FILL_JS = """
(function (u, p, submit) {
  const pw = document.querySelector('input[type=password]');
  if (!pw) return false;
  const user = document.querySelector(
    'input[name=username], input#username, input[name=j_username], input[type=email], input[name=loginfmt]');
  const set = (el, v) => {
    if (!el || !v) return;
    el.focus(); el.value = v;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  };
  set(user, u); set(pw, p);
  if (submit && pw.form) {
    pw.form.requestSubmit ? pw.form.requestSubmit() : pw.form.submit();
  }
  return true;
})(%s, %s, %s);
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


class SsoWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application, url: str):
        super().__init__(application=app, title="VPN sign-in", default_width=520, default_height=720)
        self.username = ask_app("hpc-hub:sso-username") or ""
        self.password = ask_app("hpc-hub:sso-password") or ""
        self.submitted = False

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
        self.view.load_uri(url)

    def on_load(self, view: WebKit.WebView, event: WebKit.LoadEvent) -> None:
        if event != WebKit.LoadEvent.FINISHED:
            return
        uri = view.get_uri() or ""
        if urlparse(uri).hostname in ("localhost", "127.0.0.1"):
            self.status.set_label("Signed in. Connecting…")
            GLib.timeout_add(1500, self.close)
            return
        if not self.password:
            return
        script = FILL_JS % (json.dumps(self.username), json.dumps(self.password),
                            "false" if self.submitted else "true")
        view.evaluate_javascript(script, -1, None, None, None, self.on_filled, None)

    def on_filled(self, view, result, _data) -> None:
        try:
            value = view.evaluate_javascript_finish(result)
        except GLib.Error:
            return
        if value.to_boolean():
            self.submitted = True


def main() -> int:
    if len(sys.argv) < 2:
        return 1
    url = sys.argv[1]
    app = Gtk.Application(application_id=None)
    app.connect("activate", lambda a: SsoWindow(a, url).present())
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
