"""A row in the transfers list: progress of a copy between clusters."""

from collections.abc import Callable

from gi.repository import GLib, Gtk, Pango

from .. import transfer


class TransferRow(Gtk.ListBoxRow):
    """The X cancels while it runs, and takes the row off the list once it is over."""

    def __init__(self, title: str, progress: transfer.Progress, on_cancel: Callable[[], None] | None = None):
        super().__init__(activatable=False)
        self.progress, self.on_cancel = progress, on_cancel
        box = Gtk.Box(spacing=12, margin_top=6, margin_bottom=6, margin_start=12, margin_end=12)
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4, hexpand=True)
        self.title = Gtk.Label(label=title, xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE)
        self.bar = Gtk.ProgressBar()
        self.status = Gtk.Label(xalign=0, css_classes=["dim-label", "caption"])
        for w in (self.title, self.bar, self.status):
            col.append(w)
        self.cancel = Gtk.Button(icon_name="process-stop-symbolic", tooltip_text="Cancel", valign=Gtk.Align.CENTER,
                                 css_classes=["flat"])
        self.cancel.connect("clicked", lambda *_: self._x())
        box.append(col)
        box.append(self.cancel)
        self.set_child(box)

    def _x(self) -> None:
        if self.progress.finished:
            parent = self.get_parent()
            parent.remove(self)
            if not parent.get_row_at_index(0) and isinstance(rev := parent.get_ancestor(Gtk.Revealer), Gtk.Revealer):
                rev.set_reveal_child(False)
            return
        self.progress.cancelled.set()
        self.cancel.set_sensitive(False)
        self.status.set_label("Cancelling…")
        if self.on_cancel:
            self.on_cancel()

    def update(self, status: str = "") -> None:
        p = self.progress
        if p.total:
            self.bar.set_fraction(p.fraction)
        elif not p.finished:
            self.bar.pulse()
        total = GLib.format_size(p.total) if p.total else "?"
        self.status.set_label(status or f"{GLib.format_size(p.done)} of {total}")
        if p.finished:
            self.cancel.set_icon_name("window-close-symbolic")
            self.cancel.set_tooltip_text("Remove from list")
            self.cancel.set_sensitive(True)

    def finish(self, status: str) -> None:
        self.progress.finished = True
        self.update(status)
