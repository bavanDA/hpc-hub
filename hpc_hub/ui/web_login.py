"""In-app VPN web sign-in (AnyConnect SAML): fill the login, you approve Duo, we read the token."""

from collections.abc import Callable

import gi

gi.require_version("WebKit", "6.0")
from gi.repository import Adw, GLib, Gtk, WebKit  # noqa: E402

from ..sso import AutoFill  # noqa: E402
from ..vpn_sso import SsoStart  # noqa: E402


class WebLoginDialog(Adw.Dialog):
    def __init__(self, title: str, start: SsoStart, username: str, password: str,
                 on_done: Callable[[str, str], None]):
        super().__init__(title=title, content_width=560, content_height=780, can_close=True)
        self.start, self.on_done, self.finished = start, on_done, False
        self.status = Gtk.Label(label="Signing in… approve Duo on your phone when it asks.", wrap=True,
                                margin_top=8, margin_bottom=8, css_classes=["dim-label"])
        self.view = WebKit.WebView(vexpand=True)
        self.view.connect("load-changed", self._loaded)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(self.status)
        box.append(self.view)
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.fill = AutoFill(self.view, username, password,
                             lambda: self.status.set_label("Password sent. Approve Duo on your phone."))
        self.connect("closed", lambda *_: self._finish("", "Sign-in cancelled"))
        self.view.load_uri(start.login_url)

    def _finish(self, token: str, err: str) -> None:
        if not self.finished:
            self.finished = True
            self.on_done(token, err)

    def _loaded(self, view, event) -> None:
        if event != WebKit.LoadEvent.FINISHED:
            return
        uri = view.get_uri() or ""
        if self.start.final_url and uri.startswith(self.start.final_url):
            self.status.set_label("Signed in. Connecting…")
            cookies = view.get_network_session().get_cookie_manager()
            cookies.get_cookies(self.start.final_url, None, self._got_cookies, None)
            return
        self.fill.page_loaded()

    def _got_cookies(self, manager, result, _data) -> None:
        try:
            jar = {c.get_name(): c.get_value() for c in manager.get_cookies_finish(result)}
        except GLib.Error as e:
            jar, err = {}, e.message
        else:
            err = GLib.uri_unescape_string(jar.get(self.start.error_cookie, ""), None) or ""
        token = jar.get(self.start.token_cookie, "")
        self._finish(token, "" if token else (err or "No sign-in token from the VPN server"))
        self.force_close()
