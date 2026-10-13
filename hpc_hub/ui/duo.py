"""Big 'approve Duo on your phone' screen shown while a login waits for Duo."""

import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk


class DuoDialog(Adw.Dialog):
    def __init__(self, cluster: str, on_cancel: Callable[[], None]):
        super().__init__(title="Duo", content_width=460, can_close=False)
        self.started = time.monotonic()

        spinner = Adw.Spinner(width_request=48, height_request=48)
        self.page = Adw.StatusPage(
            icon_name="phone-symbolic",
            title="Approve Duo on your phone",
            description=f"<b>{GLib.markup_escape_text(cluster)}</b> is waiting.\nOpen Duo Mobile and tap Approve.",
        )
        self.waited = Gtk.Label(css_classes=["dim-label", "numeric"])
        cancel = Gtk.Button(label="Cancel login", halign=Gtk.Align.CENTER, css_classes=["pill"])
        cancel.connect("clicked", lambda *_: on_cancel())

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18, halign=Gtk.Align.CENTER)
        for w in (spinner, self.waited, cancel):
            box.append(w)
        self.page.set_child(box)
        self.set_child(self.page)

        self._tick()
        self.timer = GLib.timeout_add_seconds(1, self._tick)
        self.connect("closed", lambda *_: GLib.source_remove(self.timer))

    def _tick(self) -> bool:
        s = int(time.monotonic() - self.started)
        self.waited.set_label(f"Waiting {s // 60}:{s % 60:02d}")
        return True

    def done(self) -> None:
        self.force_close()
