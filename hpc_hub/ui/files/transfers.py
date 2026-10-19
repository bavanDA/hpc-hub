"""A row in the transfers list: progress of a copy between clusters."""

from gi.repository import GLib, Gtk, Pango

from ... import transfer


class TransferRow(Gtk.ListBoxRow):
    def __init__(self, title: str, progress: transfer.Progress):
        super().__init__(activatable=False)
        self.progress = progress
        box = Gtk.Box(spacing=12, margin_top=6, margin_bottom=6, margin_start=12, margin_end=12)
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4, hexpand=True)
        self.title = Gtk.Label(label=title, xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE)
        self.bar = Gtk.ProgressBar()
        self.status = Gtk.Label(xalign=0, css_classes=["dim-label", "caption"])
        for w in (self.title, self.bar, self.status):
            col.append(w)
        self.cancel = Gtk.Button(icon_name="process-stop-symbolic", tooltip_text="Cancel", valign=Gtk.Align.CENTER,
                                 css_classes=["flat"])
        self.cancel.connect("clicked", lambda *_: progress.cancelled.set())
        box.append(col)
        box.append(self.cancel)
        self.set_child(box)

    def update(self, status: str = "") -> None:
        p = self.progress
        if p.total:
            self.bar.set_fraction(p.fraction)
        else:
            self.bar.pulse()
        self.status.set_label(status or f"{GLib.format_size(p.done)} of {GLib.format_size(p.total) if p.total else '?'}")
        if p.finished:
            self.cancel.set_visible(False)
