"""FilePane: one cluster's folder as a table, with navigation and the action bar."""

import posixpath
import time
from collections.abc import Callable

from gi.repository import Adw, Gio, GLib, GObject, Gtk, Pango

from ... import remote_fs
from ...remote_fs import Entry
from ...session import ClusterSession, State
from ..widgets import bg
from . import menu
from .actions import TEXT, FileActionsMixin


class EntryItem(GObject.Object):
    def __init__(self, entry: Entry):
        super().__init__()
        self.entry = entry


class FilePane(FileActionsMixin, Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None], index: int,
                 on_copy: Callable[["FilePane", Entry], None], on_latex: Callable[[ClusterSession, str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        self.sessions = sessions
        self.toast = toast
        self.on_copy = on_copy
        self.on_latex = on_latex
        self.on_tool: Callable[[ClusterSession, str, str], None] | None = None  # VS Code / agents in a folder
        self.on_paste: Callable[[], None] | None = None
        self.can_paste: Callable[[], bool] | None = None
        self.text_ext = TEXT
        self.paths: dict[str, str] = {}
        self.path = ""

        top = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=8, margin_end=8)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        self.cluster.set_selected(index)
        self.location = Gtk.Entry(hexpand=True, placeholder_text="/path", width_chars=8)
        top.append(self.cluster)
        top.append(self.location)
        nav = self.nav = Gtk.Box(spacing=4, margin_start=8, margin_end=8, margin_bottom=6)
        for icon, tip, fn in (("go-up-symbolic", "Up", self.go_up), ("go-home-symbolic", "Home", self.go_home),
                              ("view-refresh-symbolic", "Refresh", self.refresh),
                              ("folder-new-symbolic", "New folder", self.new_folder),
                              ("document-send-symbolic", "Upload files here", self.upload)):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: f())
            nav.append(b)
        self.count = Gtk.Label(hexpand=True, xalign=1, css_classes=["dim-label", "caption"])
        nav.append(self.count)
        self.append(top)
        self.append(nav)

        self.store = Gio.ListStore(item_type=EntryItem)
        self.selection = Gtk.SingleSelection(model=self.store, autoselect=False, can_unselect=True)
        self.view = Gtk.ColumnView(model=self.selection, show_row_separators=False)
        self.view.add_css_class("data-table")
        for title, attr, expand in (("Name", "name", True), ("Size", "size", False), ("Modified", "mtime", False)):
            f = Gtk.SignalListItemFactory()
            f.connect("setup", self._setup, attr)
            f.connect("bind", self._bind, attr)
            self.view.append_column(Gtk.ColumnViewColumn(title=title, factory=f, expand=expand, resizable=True))
        self.view.connect("activate", lambda _v, pos: self.open_entry(self.store.get_item(pos).entry))
        menu.install(self)

        self.empty = Adw.StatusPage(icon_name="folder-symbolic")
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=self.view), "list")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)

        bar = Gtk.Box(spacing=4, margin_top=6, margin_bottom=6, margin_start=8, margin_end=8)
        self.actions: dict[str, Gtk.Button] = {}
        for key, label, icon in (("open", "Open", "document-open-symbolic"),
                                 ("download", "Download", "folder-download-symbolic"),
                                 ("rename", "Rename", "document-edit-symbolic"),
                                 ("zip", "Zip", "package-x-generic-symbolic"),
                                 ("latex", "LaTeX", "x-office-document-symbolic"),
                                 ("delete", "Delete", "user-trash-symbolic"),
                                 ("copy", "Copy, then paste it on any cluster", "edit-copy-symbolic")):
            if key == "copy":
                b = Gtk.Button(child=Adw.ButtonContent(label="Copy", icon_name=icon),
                               tooltip_text=label, hexpand=True, halign=Gtk.Align.END)
            else:
                b = Gtk.Button(icon_name=icon, css_classes=["flat"], tooltip_text=label)
            b.connect("clicked", lambda *_, k=key: self._action(k))
            self.actions[key] = b
            bar.append(b)
        self.append(bar)

        self.cluster.connect("notify::selected", lambda *_: self.go(self.paths.get(self.session.cfg.id, "")))
        self.location.connect("activate", lambda *_: self.go(self.location.get_text().strip()))
        self.on_select: Callable[[Entry | None], None] | None = None
        self.selection.connect("notify::selected-item", lambda *_: (self._sync(), self.on_select and
                                                                     self.on_select(self.selected())))
        self._sync()

    # -- columns ----------------------------------------------------------------------
    def _setup(self, _f, item, attr):
        if attr == "name":
            box = Gtk.Box(spacing=8)
            box.append(Gtk.Image())
            box.append(Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE))
            item.set_child(box)
        else:
            item.set_child(Gtk.Label(xalign=1 if attr == "size" else 0, css_classes=["dim-label", "numeric"]))

    def _bind(self, _f, item, attr):
        e: Entry = item.get_item().entry
        item.get_child().row_pos = item.get_position()  # for the right-click menu
        if attr == "name":
            icon, label = item.get_child().get_first_child(), item.get_child().get_last_child()
            icon.set_from_icon_name("folder-symbolic" if e.is_dir else
                                    "x-office-document-symbolic" if remote_fs.ext(e.name) == ".pdf" else "text-x-generic-symbolic")
            label.set_label(e.name)
        elif attr == "size":
            item.get_child().set_label("" if e.is_dir else GLib.format_size(e.size))
        else:
            item.get_child().set_label(time.strftime("%Y-%m-%d %H:%M", time.localtime(e.mtime)))

    # -- navigation ----------------------------------------------------------------------
    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def set_session(self, session: ClusterSession) -> None:
        self.cluster.set_selected(self.sessions.index(session))

    def _connected(self) -> bool:
        s = self.session
        if s.connected:
            return True
        self.store.remove_all()
        self.empty.set_title("Not connected")
        self.empty.set_description(f"Connect to {GLib.markup_escape_text(s.cfg.name)} to browse files.")
        self.empty.set_icon_name("network-offline-symbolic")
        self.stack.set_visible_child_name("empty")
        self.count.set_label("")
        self._sync()
        return False

    def go(self, path: str) -> None:
        if not self._connected():
            return
        s = self.session

        def work():
            target = remote_fs.expand(s.ssh, path or "~")
            return target, remote_fs.list_dir(s.ssh, target)

        def done(result, err):
            if s is not self.session:
                return
            if err:
                self.toast(f"{s.cfg.name}: {err}")
                if not self.path:
                    self.empty.set_title("Could not open folder")
                    self.empty.set_description(GLib.markup_escape_text(err))
                    self.stack.set_visible_child_name("empty")
                return
            target, entries = result
            self.path = target
            self.paths[s.cfg.id] = target
            self.location.set_text(target)
            self.store.splice(0, self.store.get_n_items(), [EntryItem(e) for e in entries])
            self.count.set_label(f"{len(entries)} items")
            if entries:
                self.stack.set_visible_child_name("list")
            else:
                self.empty.set_title("Empty folder")
                self.empty.set_description("")
                self.empty.set_icon_name("folder-symbolic")
                self.stack.set_visible_child_name("empty")
            self._sync()

        self.location.set_text(path)
        bg(work, done)

    def refresh(self) -> None:
        self.go(self.path)

    def go_up(self) -> None:
        if self.path:
            self.go(posixpath.dirname(self.path.rstrip("/")) or "/")

    def go_home(self) -> None:
        self.go("")

    def child(self, e: Entry) -> str:
        return posixpath.join(self.path, e.name)

    # -- actions ---------------------------------------------------------------------------
    def selected(self) -> Entry | None:
        item = self.selection.get_selected_item()
        return item.entry if item else None

    def _sync(self) -> None:
        e = self.selected()
        ok = e is not None and self.session.state == State.CONNECTED
        for b in self.actions.values():
            b.set_sensitive(ok)
        if e:
            is_archive = remote_fs.ext(e.name) in remote_fs.ARCHIVES
            self.actions["zip"].set_tooltip_text("Extract here" if is_archive else "Zip on the cluster")
            self.actions["zip"].set_icon_name("extract-archive-symbolic" if is_archive else "package-x-generic-symbolic")
            self.actions["latex"].set_visible(remote_fs.ext(e.name) == ".tex")
        else:
            self.actions["latex"].set_visible(False)

    def _action(self, key: str) -> None:
        e = self.selected()
        if not e:
            return
        {"open": self.open_entry, "download": self.download, "rename": self.rename, "delete": self.delete,
         "zip": self.zip_or_extract, "copy": lambda e: self.on_copy(self, e),
         "latex": lambda e: self.on_latex(self.session, self.child(e))}[key](e)

    def _done(self, msg: str, refresh: bool = True):
        def done(_r, err):
            self.toast(f"Failed: {err}" if err else msg)
            if refresh:
                self.refresh()
        return done
