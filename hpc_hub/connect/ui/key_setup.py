"""Log in through the cluster's web portal (e.g. SDSC Expanse with ACCESS): you sign in in a window HPC Hub controls
(our Chrome window, or the app's sign-in window), then the app adds this computer's SSH key through the portal and
connects with it. Your own browser is never touched. No password is stored; the cluster still asks for its code."""

import threading
from collections.abc import Callable

from gi.repository import Adw, GLib

from ...core import my_key
from ...core.config import ClusterConfig
from ..ood import PortalError, add_key_signed_in
from ..vpn_sso import SsoStart

SignIn = Callable[[SsoStart], tuple[str, str]]  # shows a sign-in window (worker thread): (session cookie, error)


def public_key() -> str:
    key = my_key.find()
    return key.public if key else ""


class KeySetupDialog(Adw.Dialog):
    """on_done(username) once the key is on the cluster. sign_in: the app's web sign-in (prompts.py)."""

    def __init__(self, cfg: ClusterConfig, sign_in: SignIn, on_done: Callable[[str], None]):
        super().__init__(title=f"Sign in to {cfg.name}", content_width=480)
        self.cfg, self.sign_in, self.on_done = cfg, sign_in, on_done
        self.stop = threading.Event()
        self.page = Adw.StatusPage(icon_name="web-browser-symbolic", title="Sign in to the portal",
                                   description="Sign in in the window that opened. The app does the rest by itself.")
        self.spinner = Adw.Spinner(width_request=32, height_request=32)
        self.page.set_child(self.spinner)
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

    def _sign_in(self, start: SsoStart) -> tuple[str, str]:
        return ("", "Stopped") if self.stop.is_set() else self.sign_in(start)

    def _work(self) -> None:
        key = public_key()
        if not key:
            self._say("No SSH key on this computer", "Make one in a terminal with: ssh-keygen -t ed25519", False)
            return
        try:
            user, _ = add_key_signed_in(self.cfg.portal, self._sign_in, key, lambda user: self._say(
                f"Signed in as {user}", "Adding this computer's key to your account…"))
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
