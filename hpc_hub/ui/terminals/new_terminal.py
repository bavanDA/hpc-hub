"""Dialog for a new tmux terminal: name, cluster, login or compute node, folder, color."""

import time

from gi.repository import Adw, Gtk

from ... import tmux
from ...connect.session import ClusterSession
from ..widgets import color_dot


class NewTerminalDialog(Adw.Dialog):
    def __init__(self, live: list[ClusterSession], on_create):
        super().__init__(title="New terminal", content_width=480)
        self.live, self.on_create = live, on_create
        self.color = tmux.COLORS[0]
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(description="Runs in tmux, so it keeps going when you close the tab.")
        self.name = Adw.EntryRow(title="Name")
        self.name.set_text(f"Terminal {time.strftime('%H:%M')}")
        self.cluster = Adw.ComboRow(title="Cluster", model=Gtk.StringList.new([s.cfg.name for s in live]))
        self.where = Adw.ComboRow(title="Run on")
        self.folder = Adw.ActionRow(title="Start in", subtitle="~", activatable=True)
        pick = Gtk.Button(label="Choose…", valign=Gtk.Align.CENTER)
        pick.connect("clicked", lambda *_: self._browse())
        self.folder.connect("activated", lambda *_: self._browse())
        self.folder.add_suffix(pick)
        colors = Adw.ActionRow(title="Color")
        dots = Gtk.Box(spacing=2, valign=Gtk.Align.CENTER)
        self.color_btns = []
        for c in tmux.COLORS:
            b = Gtk.ToggleButton(child=color_dot(c, 16), css_classes=["flat", "circular"], active=c == self.color)
            b.connect("toggled", lambda btn, c=c: btn.get_active() and self._pick_color(c))
            dots.append(b)
            self.color_btns.append(b)
        colors.add_suffix(dots)
        for row in (self.name, self.cluster, self.where, self.folder, colors):
            group.add(row)
        page.add(group)
        self.cluster.connect("notify::selected", lambda *_: self._sync())
        create = Gtk.Button(label="Open terminal", css_classes=["suggested-action", "pill"], halign=Gtk.Align.CENTER,
                            margin_bottom=18)
        create.connect("clicked", lambda *_: self._create())
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(page)
        box.append(create)
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self._sync()

    @property
    def session(self) -> ClusterSession:
        return self.live[self.cluster.get_selected()]

    def _sync(self) -> None:
        a = self.session.allocation
        options = ["Login node"] + ([f"Compute node {a.node} (job {a.job_id})"] if a else [])
        self.where.set_model(Gtk.StringList.new(options))
        self.where.set_selected(len(options) - 1)
        self.where.set_subtitle("" if a else "No compute node right now. Get one on the cluster card.")

    def _pick_color(self, c: str) -> None:
        self.color = c
        for b, col in zip(self.color_btns, tmux.COLORS):
            if col != c:
                b.set_active(False)

    def _browse(self) -> None:
        from ...files.ui.folder_picker import FolderPicker
        FolderPicker(self.session, self.folder.get_subtitle() or "~", self.folder.set_subtitle).present(self)

    def _create(self) -> None:
        self.close()
        self.on_create(self.session, self.where.get_selected() == 1, self.name.get_text().strip() or "Terminal",
                       self.color, self.folder.get_subtitle() or "~")
