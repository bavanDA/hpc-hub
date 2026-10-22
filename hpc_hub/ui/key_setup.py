"""Log in through the cluster's web portal in Chrome (e.g. SDSC Expanse with ACCESS): once you are signed in
there, the app adds this computer's SSH key through the portal and connects with it. No password is stored;
the cluster still asks for its code."""

import threading
import time
from collections.abc import Callable
from pathlib import Path

from gi.repository import Adw, GLib, Gtk

from .. import browser
from ..config import ClusterConfig
from ..ood import Portal, PortalError
from .widgets import open_uri

KEYS = ["id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"]


def public_key() -> str:
    for name in KEYS:
        f = Path.home() / ".ssh" / name
        if f.exists():
            return f.read_text().strip()
    return ""


class KeySetupDialog(Adw.Dialog):
    """on_done(username) once the key is on the cluster."""

    def __init__(self, cfg: ClusterConfig, on_done: Callable[[str], None]):
        super().__init__(title=f"Log in to {cfg.name}", content_width=480)
        self.cfg, self.on_done = cfg, on_done
        self.stop = threading.Event()
        self.page = Adw.StatusPage(icon_name="web-browser-symbolic", title="Sign in to the portal in Chrome",
                                   description="Any Chrome profile works. Use ACCESS and your saved logins; the app "
                                               "does the rest by itself.")
        self.spinner = Adw.Spinner(width_request=32, height_request=32)
        again = Gtk.Button(label="Open the portal again", css_classes=["pill"], halign=Gtk.Align.CENTER)
        again.connect("clicked", lambda *_: open_uri(self, cfg.portal))
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, halign=Gtk.Align.CENTER)
        box.append(self.spinner)
        box.append(again)
        self.page.set_child(box)
        tv = Adw.ToolbarView(content=self.page)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.connect("closed", lambda *_: self.stop.set())
        threading.Thread(target=self._work, daemon=True).start()

    def _say(self, title: str, text: str = "", busy: bool = True) -> None:
        def show():
            self.page.set_title(title)
            self.page.set_description(text)
            self.spinner.set_visible(busy)
            return False
        GLib.idle_add(show)

    def _signed_in(self, portals: list[Portal]) -> tuple[Portal | None, str, str, str]:
        """The first Chrome profile signed in to the portal: (portal, user, home, csrf)."""
        for portal in portals:
            user, home, csrf = portal.signed_in()
            if user:
                return portal, user, home, csrf
        return None, "", "", ""

    def _work(self) -> None:
        key = public_key()
        if not key:
            self._say("No SSH key on this computer", "Make one in a terminal with: ssh-keygen -t ed25519", False)
            return
        try:
            portals = [Portal(self.cfg.portal, p.name) for p in browser.profiles()]
            if not portals:
                self._say("No Chrome profiles found", "Install Google Chrome and sign in to the portal there.", False)
                return
            opened = False
            while not self.stop.is_set():
                portal, user, home, csrf = self._signed_in(portals)
                if portal:
                    break
                if not opened:  # already signed in from before? then Chrome never needs to open
                    GLib.idle_add(lambda: open_uri(self, self.cfg.portal) or False)
                    opened = True
                time.sleep(3)
            else:
                return
            self._say(f"Signed in as {user}", "Adding this computer's key to your account…")
            portal.add_key(home, csrf, key)
        except (PortalError, OSError, ValueError) as e:
            self._say("Could not finish", str(e), False)
            return
        self._say(f"Signed in as {user}", "Key added. Connecting…")
        GLib.idle_add(self._finish, user)

    def _finish(self, user: str) -> bool:
        if not self.stop.is_set():
            self.stop.set()
            self.force_close()
            self.on_done(user)
        return False
