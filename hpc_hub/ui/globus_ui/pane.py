"""One side of the Globus tab: a cluster's collection, browsed through Globus."""

import posixpath
from collections.abc import Callable
from typing import TYPE_CHECKING

from gi.repository import Adw, Gio, GLib, GObject, Gtk, Pango

from ... import globus
from ...core.config import ClusterConfig
from ..widgets import ask_name, bg

if TYPE_CHECKING:
    from .page import GlobusPage


def or_consent(work: Callable[[], object]) -> Callable[[], object]:
    """Return a NeedsSignIn instead of raising it, so done() can spot it."""
    def run():
        try:
            return work()
        except globus.NeedsSignIn as e:
            return e
    return run


class ItemObj(GObject.Object):
    def __init__(self, item: globus.Item):
        super().__init__()
        self.item = item


class GlobusPane(Gtk.Box):
    """One side: a cluster's Globus collection, browsed through Globus (no SSH or VPN needed)."""

    def __init__(self, page: "GlobusPage", index: int):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        self.page = page
        self.path = ""
        self.paths: dict[str, str] = {}
        self.other: GlobusPane | None = None
        self._empty = None

        top = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=8, margin_end=8)
        self.cluster = Gtk.DropDown.new_from_strings([c.name for c in page.clusters])
        self.cluster.set_selected(index)
        self.location = Gtk.Entry(hexpand=True, placeholder_text="/path", width_chars=8)
        top.append(self.cluster)
        top.append(self.location)
        nav = Gtk.Box(spacing=4, margin_start=8, margin_end=8, margin_bottom=6)
        for icon, tip, fn in (("go-up-symbolic", "Up", self.go_up), ("go-home-symbolic", "Home", lambda: self.go("")),
                              ("view-refresh-symbolic", "Refresh", lambda: self.go(self.path)),
                              ("folder-new-symbolic", "New folder", self.new_folder)):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: f())
            nav.append(b)
        self.count = Gtk.Label(hexpand=True, xalign=1, css_classes=["dim-label", "caption"])
        nav.append(self.count)
        self.append(top)
        self.append(nav)

        self.store = Gio.ListStore(item_type=ItemObj)
        self.selection = Gtk.SingleSelection(model=self.store, autoselect=False, can_unselect=True)
        view = Gtk.ColumnView(model=self.selection, show_row_separators=False, css_classes=["data-table"])
        for title, attr, expand in (("Name", "name", True), ("Size", "size", False), ("Modified", "modified", False)):
            f = Gtk.SignalListItemFactory()
            f.connect("setup", self._setup, attr)
            f.connect("bind", self._bind, attr)
            view.append_column(Gtk.ColumnViewColumn(title=title, factory=f, expand=expand, resizable=True))
        view.connect("activate", lambda _v, pos: self._open(self.store.get_item(pos).item))

        self.empty = Adw.StatusPage(icon_name="folder-symbolic")
        self.empty_btn = Gtk.Button(halign=Gtk.Align.CENTER, css_classes=["pill", "suggested-action"])
        self.empty_btn.connect("clicked", lambda *_: self._empty_action())
        self.empty.set_child(self.empty_btn)
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=view), "list")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)

        self.send = Gtk.Button(child=Adw.ButtonContent(label="Transfer", icon_name="document-send-symbolic"),
                               halign=Gtk.Align.END, margin_top=6, margin_bottom=6, margin_start=8, margin_end=8)
        self.send.connect("clicked", lambda *_: page.transfer(self))
        self.append(self.send)

        self.cluster.connect("notify::selected", lambda *_: self.go(self.paths.get(self.cfg.id, "")))
        self.location.connect("activate", lambda *_: self.go(self.location.get_text().strip()))
        self.selection.connect("notify::selected-item", lambda *_: self._sync())
        self._sync()

    def _setup(self, _f, li, attr):
        if attr == "name":
            box = Gtk.Box(spacing=8)
            box.append(Gtk.Image())
            box.append(Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE))
            li.set_child(box)
        else:
            li.set_child(Gtk.Label(xalign=1 if attr == "size" else 0, css_classes=["dim-label", "numeric"]))

    def _bind(self, _f, li, attr):
        it: globus.Item = li.get_item().item
        if attr == "name":
            box = li.get_child()
            box.get_first_child().set_from_icon_name("folder-symbolic" if it.is_dir else "text-x-generic-symbolic")
            box.get_last_child().set_label(it.name)
        elif attr == "size":
            li.get_child().set_label("" if it.is_dir else GLib.format_size(it.size))
        else:
            li.get_child().set_label(it.modified)

    @property
    def cfg(self) -> ClusterConfig:
        return self.page.clusters[self.cluster.get_selected()]

    def selected(self) -> globus.Item | None:
        obj = self.selection.get_selected_item()
        return obj.item if obj else None

    def _sync(self) -> None:
        is_left = self.page.left is self if hasattr(self.page, "left") else True
        self.send.get_child().set_label("Transfer →" if is_left else "← Transfer")
        self.send.set_sensitive(self.selected() is not None)

    def _show_empty(self, title: str, text: str = "", icon: str = "folder-symbolic", button: str = "",
                    action=None) -> None:
        self.store.remove_all()
        self.empty.set_title(title)
        self.empty.set_description(GLib.markup_escape_text(text))
        self.empty.set_icon_name(icon)
        self.empty_btn.set_label(button)
        self.empty_btn.set_visible(bool(button))
        self._empty = action
        self.count.set_label("")
        self.stack.set_visible_child_name("empty")
        self._sync()

    def _empty_action(self) -> None:
        if self._empty:
            self._empty()

    def go(self, path: str) -> None:
        cfg, client = self.cfg, self.page.client
        if not client:
            return
        if not cfg.globus.collection_id:
            self._show_empty(f"No collection for {cfg.name}", "Pick the Globus collection that holds its files.",
                             "folder-remote-symbolic", "Choose collection", lambda: self.page.pick(cfg))
            return
        self.location.set_text(path)
        self.count.set_label("Loading…")

        def done(result, err):
            if cfg is not self.cfg:
                return
            if isinstance(result, globus.NeedsSignIn):
                self.page.need(cfg, result)
                if isinstance(result, globus.SessionRequired):
                    self._show_empty(f"{cfg.name} wants your {result.domains[0]} account",
                                     f"{cfg.globus.collection_name} only lets in {' or '.join(result.domains)} "
                                     "accounts. Sign in with it once.", "dialog-password-symbolic", "Sign in",
                                     self.page.consent)
                else:
                    self._show_empty("Globus needs your permission",
                                     f"Allow HPC Hub to use {cfg.globus.collection_name}.",
                                     "dialog-password-symbolic", "Allow", self.page.consent)
                return
            if err and globus.personal_offline(err):
                self._show_empty(f"Globus Connect is not running on {cfg.name}",
                                 f"Your {cfg.globus.collection_name} collection only works while it runs there. "
                                 "Start it on the login node? It shares your home, project and scratch folders, "
                                 "only with your own Globus account.", "network-offline-symbolic", "Start it",
                                 lambda: self.page.start_personal(cfg))
                return
            if err:
                if self.path and path != self.path:
                    self.page.toast(f"{cfg.name}: {err}")
                    self.location.set_text(self.path)
                    self.count.set_label("")
                else:
                    self._show_empty("Could not open folder", err, "dialog-error-symbolic", "Try again",
                                     lambda: self.go(path))
                return
            target, items = result
            self.path = self.paths[cfg.id] = target
            self.location.set_text(target)
            self.store.splice(0, self.store.get_n_items(), [ItemObj(i) for i in items])
            self.count.set_label(f"{len(items)} items")
            if items:
                self.stack.set_visible_child_name("list")
            else:
                self._show_empty("Empty folder")
                self.count.set_label("0 items")
            self._sync()

        bg(or_consent(lambda: client.ls(cfg.globus.collection_id, path)), done)

    def go_up(self) -> None:
        if self.path:
            self.go(posixpath.dirname(self.path.rstrip("/")) or "/")

    def _open(self, it: globus.Item) -> None:
        if it.is_dir:
            self.go(posixpath.join(self.path, it.name))

    def new_folder(self) -> None:
        cfg, client = self.cfg, self.page.client
        if not (client and cfg.globus.collection_id and self.path):
            return
        ask_name(self.get_root(), "New folder", "Create", lambda name: bg(
            lambda: client.mkdir(cfg.globus.collection_id, posixpath.join(self.path, name)),
            lambda _r, err: (self.page.toast(f"Failed: {err}") if err else self.go(self.path))))
