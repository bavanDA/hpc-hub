"""Log in with an SSH key added through the cluster's web portal, which you open in Chrome with your
saved logins (e.g. SDSC Expanse with ACCESS). No password is stored; the cluster still asks for its code."""

import shlex
from collections.abc import Callable
from pathlib import Path

from gi.repository import Adw, Gdk, Gtk

from .. import browser
from ..config import ClusterConfig
from .widgets import open_uri

KEYS = ["id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"]


def public_key() -> str:
    for name in KEYS:
        f = Path.home() / ".ssh" / name
        if f.exists():
            return f.read_text().strip()
    return ""


def add_key_command(key: str) -> str:
    return (f"mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo {shlex.quote(key)} >> ~/.ssh/authorized_keys "
            "&& chmod 600 ~/.ssh/authorized_keys")


class KeySetupDialog(Adw.Dialog):
    """on_done(username) when you press Connect."""

    def __init__(self, cfg: ClusterConfig, on_done: Callable[[str], None]):
        super().__init__(title=f"Log in to {cfg.name} with Chrome", content_width=560)
        self.cfg, self.on_done = cfg, on_done
        self.key = public_key()
        page = Adw.PreferencesPage()
        who = f"Chrome ({browser.preferred})" if browser.preferred else "your browser"

        step1 = Adw.PreferencesGroup(title="1. Open the portal",
                                     description=f"It opens in {who}. Sign in there with ACCESS, using your saved logins.")
        open_row = Adw.ButtonRow(title="Open the portal", end_icon_name="adw-external-link-symbolic")
        open_row.connect("activated", lambda *_: open_uri(self, cfg.portal))
        step1.add(open_row)
        page.add(step1)

        step2 = Adw.PreferencesGroup(
            title="2. Add this computer's key (once)",
            description="In the portal open a shell (Clusters menu), paste the command and press Enter.")
        copy = Adw.ButtonRow(title="Copy the command", start_icon_name="edit-copy-symbolic")
        copy.connect("activated", lambda *_: self._copy())
        copy.set_sensitive(bool(self.key))
        step2.add(copy)
        if not self.key:
            step2.set_description("No SSH key found in ~/.ssh. Make one with: ssh-keygen -t ed25519")
        page.add(step2)

        step3 = Adw.PreferencesGroup(title="3. Your ACCESS username",
                                     description="Shown at the top right of the portal.")
        self.user = Adw.EntryRow(title="Username")
        self.user.connect("entry-activated", lambda *_: self._done())
        connect = Adw.ButtonRow(title="Connect")
        connect.add_css_class("suggested-action")
        connect.connect("activated", lambda *_: self._done())
        step3.add(self.user)
        step3.add(connect)
        page.add(step3)

        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.toasts = Adw.ToastOverlay(child=tv)
        self.set_child(self.toasts)

    def _copy(self) -> None:
        Gdk.Display.get_default().get_clipboard().set(add_key_command(self.key))
        self.toasts.add_toast(Adw.Toast(title="Copied. Paste it in the portal's shell."))

    def _done(self) -> None:
        name = self.user.get_text().strip()
        if not name:
            self.toasts.add_toast(Adw.Toast(title="Type your ACCESS username"))
            return
        self.close()
        self.on_done(name)
