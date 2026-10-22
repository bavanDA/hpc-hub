"""Before copying a folder to another cluster: its subfolders with their sizes, so big ones can stay behind."""

import posixpath
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ... import transfer
from ...session import ClusterSession
from ..widgets import bg

BIG = 5 * 1024 ** 3  # past this, Globus (cluster to cluster) beats streaming through the laptop


class CopyDialog(Adw.Dialog):
    """on_go(skip, total): names inside the folder to leave out, and the bytes that will be copied."""

    def __init__(self, src: ClusterSession, src_path: str, dst: ClusterSession, dest_dir: str,
                 on_go: Callable[[list[str], int], None]):
        name = posixpath.basename(src_path.rstrip("/"))
        super().__init__(title=f"Copy {name} to {dst.cfg.name}", content_width=520, content_height=620)
        self.on_go, self.checks = on_go, []
        page = Adw.PreferencesPage()
        self.group = Adw.PreferencesGroup(title=f"{src.cfg.name}:{src_path}",
                                          description=f"Into {dst.cfg.name}:{dest_dir}. Measuring sizes…")
        page.add(self.group)
        self.go = Gtk.Button(label="Copy", css_classes=["suggested-action"], sensitive=False)
        self.go.connect("clicked", lambda *_: self._go())
        cancel = Gtk.Button(label="Cancel")
        cancel.connect("clicked", lambda *_: self.close())
        bar = Adw.HeaderBar(show_end_title_buttons=False, show_start_title_buttons=False)
        bar.pack_start(cancel)
        bar.pack_end(self.go)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(bar)
        self.set_child(tv)
        bg(lambda: transfer.subfolder_sizes(src.ssh, src_path), self._show)

    def _show(self, sizes, err) -> None:
        if err or sizes is None:
            self.group.set_description(GLib.markup_escape_text(f"Could not measure it: {err}"))
            return
        for name, size in sizes:
            check = Gtk.CheckButton(active=True, valign=Gtk.Align.CENTER)
            check.connect("toggled", lambda *_: self._total())
            row = Adw.ActionRow(title=GLib.markup_escape_text(name), activatable_widget=check)
            row.add_prefix(check)
            row.add_suffix(Gtk.Label(label=GLib.format_size(size), css_classes=["dim-label", "numeric"]))
            self.group.add(row)
            self.checks.append((name, size, check))
        self.go.set_sensitive(True)
        self._total()

    def _total(self) -> int:
        total = sum(size for _, size, c in self.checks if c.get_active())
        note = f"{GLib.format_size(total)} will be copied through this laptop. Untick what to leave behind."
        if total > BIG:
            note += " That is big: Globus copies it cluster to cluster, much faster."
        self.group.set_description(note)
        return total

    def _go(self) -> None:
        skip = [name for name, _, c in self.checks if not c.get_active()]
        total = self._total()
        self.close()
        self.on_go(skip, total)
