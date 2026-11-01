"""Web sign-in in our Chrome window (chrome_window.py): the sign-in is seen at once and the window closes by
itself. Never your own Chrome profile."""

import threading
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import chrome_window
from ..vpn_sso import SsoStart


class ChromeWindowDialog(Adw.Dialog):
    """Waits while you sign in in our Chrome window. on_done(token, error) once; on_in_app() to switch."""

    def __init__(self, title: str, start: SsoStart, on_done: Callable[[str, str], None],
                 on_in_app: Callable[[], None]):
        super().__init__(title=title, content_width=460)
        self.on_done, self.on_in_app, self.finished = on_done, on_in_app, False
        self.stop = threading.Event()

        page = Adw.StatusPage(icon_name="web-browser-symbolic", title="Sign in in the Chrome window",
                              description="Sign in and approve Duo in the Chrome window that opened. "
                                          "It closes by itself once you are signed in.")
        in_app = Gtk.Button(label="Sign in in the app instead", css_classes=["pill"], halign=Gtk.Align.CENTER)
        in_app.connect("clicked", lambda *_: self._switch())
        cancel = Gtk.Button(label="Cancel", css_classes=["pill", "flat"], halign=Gtk.Align.CENTER)
        cancel.connect("clicked", lambda *_: self.force_close())
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, halign=Gtk.Align.CENTER)
        box.append(Adw.Spinner(width_request=32, height_request=32))
        box.append(in_app)
        box.append(cancel)
        page.set_child(box)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.connect("closed", lambda *_: self._finish("", "Sign-in cancelled"))
        threading.Thread(target=self._wait, args=(start,), daemon=True).start()

    def _wait(self, start: SsoStart) -> None:
        token, err = chrome_window.sign_in(start, self.stop.is_set)
        if not self.stop.is_set():
            GLib.idle_add(self._got, token, err)

    def _got(self, token: str, err: str) -> bool:
        self._finish(token, err)
        self.force_close()
        return False

    def _switch(self) -> None:
        self.finished = True  # the app's window answers instead
        self.stop.set()  # closes the Chrome window
        self.force_close()
        self.on_in_app()

    def _finish(self, token: str, err: str) -> None:
        self.stop.set()
        if not self.finished:
            self.finished = True
            self.on_done(token, err)
