"""Pick a folder on a cluster."""

import posixpath
import threading
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import remote_fs
from ..session import ClusterSession


class FolderPicker(Adw.Dialog):
    def __init__(self, s: ClusterSession, start: str, on_pick: Callable[[str], None]):
        super().__init__(title=f"Folder on {s.cfg.name}", content_width=520, content_height=600)
        self.s, self.on_pick, self.path = s, on_pick, ""
        self.location = Gtk.Entry(hexpand=True)
        self.location.connect("activate", lambda *_: self.go(self.location.get_text().strip()))
        top = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=12, margin_end=12)
        for icon, tip, fn in (("go-up-symbolic", "Up", lambda: self.go(posixpath.dirname(self.path.rstrip("/")) or "/")),
                              ("go-home-symbolic", "Home", lambda: self.go("~"))):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: f())
            top.append(b)
        top.append(self.location)
        self.list = Gtk.ListBox(css_classes=["navigation-sidebar"])
        self.list.connect("row-activated", lambda _l, row: self.go(posixpath.join(self.path, row.name)))
        self.list.set_placeholder(Gtk.Label(label="No folders here", margin_top=24, css_classes=["dim-label"]))
        self.error = Gtk.Label(wrap=True, visible=False, css_classes=["error", "caption"], margin_start=12, margin_end=12)
        choose = Gtk.Button(label="Use this folder", css_classes=["suggested-action", "pill"], halign=Gtk.Align.CENTER,
                            margin_top=8, margin_bottom=12)
        choose.connect("clicked", lambda *_: (self.on_pick(self.path), self.close()) if self.path else None)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(top)
        box.append(Gtk.ScrolledWindow(child=self.list, vexpand=True))
        box.append(self.error)
        box.append(choose)
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.go(start or "~")

    def go(self, path: str) -> None:
        s = self.s

        def work():
            try:
                home = remote_fs.home(s.ssh)
                target = home + path[1:] if path.startswith("~") else path
                dirs = sorted((e.name for e in remote_fs.list_dir(s.ssh, target) if e.is_dir), key=str.lower)
                result = (target, dirs, "")
            except Exception as e:  # noqa: BLE001
                result = (path, [], str(e))
            GLib.idle_add(lambda: self._show(*result) and False)

        threading.Thread(target=work, daemon=True).start()

    def _show(self, target: str, dirs: list[str], err: str) -> None:
        self.error.set_label(err)
        self.error.set_visible(bool(err))
        if err:
            self.location.set_text(self.path)
            return
        self.path = target
        self.location.set_text(target)
        self.list.remove_all()
        for name in dirs:
            if name.startswith("."):
                continue
            row = Gtk.ListBoxRow()
            box = Gtk.Box(spacing=8, margin_top=4, margin_bottom=4)
            box.append(Gtk.Image(icon_name="folder-symbolic"))
            box.append(Gtk.Label(label=name, xalign=0))
            row.set_child(box)
            row.name = name
            self.list.append(row)
