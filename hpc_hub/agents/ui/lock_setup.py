"""Set up the passcode lock: scan a QR code with your authenticator app, type one code to check it."""

import shutil
import subprocess
from collections.abc import Callable

from gi.repository import Adw, Gdk, GLib, Gtk

from .. import lock
from ...connect.session import ClusterSession
from ...ui.widgets import bg


def qr_texture(text: str) -> Gdk.Texture | None:
    if not shutil.which("qrencode"):
        return None
    png = subprocess.run(["qrencode", "-t", "PNG", "-s", "6", "-m", "2", "-o", "-"], input=text.encode(),
                         capture_output=True).stdout
    try:
        return Gdk.Texture.new_from_bytes(GLib.Bytes.new(png))
    except GLib.Error:
        return None


class LockSetupDialog(Adw.Dialog):
    """The secret lives only in this dialog until it is on the cluster; the laptop never saves it."""

    def __init__(self, session: ClusterSession, done: Callable[[str], None]):
        super().__init__(title=f"Passcode lock on {session.cfg.name}", content_width=420)
        self.session, self.done = session, done
        self.secret = lock.new_secret()
        uri = lock.otp_uri(self.secret, f"{session.ssh.username}@{session.cfg.id}")

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_top=12, margin_bottom=24,
                      margin_start=24, margin_end=24)
        box.append(Gtk.Label(label="Scan this with Google Authenticator (or any authenticator app).", wrap=True))
        texture = qr_texture(uri)
        if texture:
            box.append(Gtk.Picture(paintable=texture, can_shrink=False, halign=Gtk.Align.CENTER))
        key = " ".join(self.secret[i:i + 4] for i in range(0, len(self.secret), 4))
        box.append(Gtk.Label(label=f"Or add it by hand, time based:\n<tt>{key}</tt>", use_markup=True,
                             selectable=True, justify=Gtk.Justification.CENTER, css_classes=["dim-label"]))
        self.code = Gtk.Entry(placeholder_text="Code from the app", input_purpose=Gtk.InputPurpose.DIGITS,
                              max_length=7, xalign=0.5, css_classes=["title-3"], activates_default=True)
        self.code.connect("activate", lambda *_: self._turn_on())
        box.append(self.code)
        self.error = Gtk.Label(css_classes=["error"], visible=False)
        box.append(self.error)
        self.button = Gtk.Button(label="Turn on", css_classes=["suggested-action", "pill"], halign=Gtk.Align.CENTER)
        self.button.connect("clicked", lambda *_: self._turn_on())
        box.append(self.button)

        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.set_focus(self.code)

    def _turn_on(self) -> None:
        if not lock.code_ok(self.secret, self.code.get_text()):
            self.error.set_label("That code doesn't match. Check the phone's clock and try again.")
            self.error.set_visible(True)
            return
        self.button.set_sensitive(False)
        self.error.set_visible(False)

        def finished(_r, err):
            if err:
                self.button.set_sensitive(True)
                self.error.set_label(f"Could not set it up: {err}")
                self.error.set_visible(True)
                return
            self.secret = ""
            self.done(f"Passcode lock is on for {self.session.cfg.name}. New Claude sessions need a code")
            self.close()
        bg(lambda: lock.install(self.session.ssh, self.secret), finished)
