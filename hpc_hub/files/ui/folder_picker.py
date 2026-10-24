"""Choose a folder on a cluster, like the desktop file chooser: places, path bar, browse by clicking."""

import posixpath
import time
from collections.abc import Callable

from gi.repository import Adw, Gio, GLib, GObject, Gtk, Pango

from ...connect.session import ClusterSession
from ...ui.widgets import ask_name, bg, shortcuts
from .. import remote_fs
from ..remote_fs import Entry, Place

_places: dict[str, list[Place]] = {}  # per cluster, found once per app run


def load_places(s: ClusterSession, done: Callable[[list[Place]], None]) -> None:
    """Places on the cluster, asked once per app run."""
    cid = s.cfg.id
    if cid in _places:
        done(_places[cid])
        return

    def got(found, _err):
        if found:
            _places[cid] = found
            done(found)
    bg(lambda: remote_fs.places(s.ssh), got)


def short(path: str, home: str = "") -> str:
    if home and (path == home or path.startswith(home + "/")):
        return "~" + path[len(home):]
    return path


class Item(GObject.Object):
    def __init__(self, entry: Entry):
        super().__init__()
        self.entry = entry


class FolderPicker(Adw.Dialog):
    def __init__(self, s: ClusterSession, start: str, on_pick: Callable[[str], None],
                 extra: list[Place] | None = None, title: str = ""):
        super().__init__(title=title or f"Choose a folder on {s.cfg.name}", content_width=860, content_height=600)
        self.s, self.on_pick, self.extra = s, on_pick, extra or []
        self.path, self.home, self.token = "", "", 0

        # sidebar: places on the cluster + your projects there
        self.sidebar = Gtk.ListBox(css_classes=["navigation-sidebar"])
        self.sidebar.connect("row-activated", lambda _l, row: self.go(row.path))
        side = Gtk.ScrolledWindow(child=self.sidebar, width_request=200, hscrollbar_policy=Gtk.PolicyType.NEVER)

        # path bar: clickable folders, or type a path (Ctrl+L)
        self.crumbs = Gtk.Box(css_classes=["linked"])
        crumb_scroll = Gtk.ScrolledWindow(child=self.crumbs, hexpand=True, vscrollbar_policy=Gtk.PolicyType.NEVER)
        self.entry = Gtk.Entry(hexpand=True, placeholder_text="Type a path, e.g. ~/project or /scratch")
        self.entry.connect("activate", lambda *_: self._typed())
        self.path_stack = Gtk.Stack(hexpand=True)
        self.path_stack.add_named(crumb_scroll, "crumbs")
        self.path_stack.add_named(self.entry, "entry")
        self.type_btn = Gtk.ToggleButton(icon_name="document-edit-symbolic", tooltip_text="Type a path (Ctrl+L)")
        self.type_btn.connect("toggled", lambda b: self._typing(b.get_active()))
        up = Gtk.Button(icon_name="go-up-symbolic", tooltip_text="Up (Alt+Up)")
        up.connect("clicked", lambda *_: self.go_up())
        bar = Gtk.Box(spacing=6, margin_top=8, margin_start=8, margin_end=8)
        for w in (up, self.path_stack, self.type_btn):
            bar.append(w)

        tools = Gtk.Box(spacing=6, margin_top=6, margin_bottom=6, margin_start=8, margin_end=8)
        self.search = Gtk.SearchEntry(placeholder_text="Filter", hexpand=True)
        self.search.connect("search-changed", lambda *_: self._refilter())
        self.hidden = Gtk.ToggleButton(icon_name="view-reveal-symbolic", tooltip_text="Show hidden (Ctrl+H)")
        self.hidden.connect("toggled", lambda *_: self._refilter())
        new = Gtk.Button(icon_name="folder-new-symbolic", tooltip_text="New folder here")
        new.connect("clicked", lambda *_: self.new_folder())
        for w in (self.search, self.hidden, new):
            tools.append(w)

        # folder list
        self.store = Gio.ListStore(item_type=Item)
        self.filter = Gtk.CustomFilter.new(self._visible)
        self.selection = Gtk.SingleSelection(model=Gtk.FilterListModel(model=self.store, filter=self.filter),
                                             autoselect=False, can_unselect=True)
        self.selection.connect("notify::selected-item", lambda *_: self._sync())
        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", self._setup)
        factory.connect("bind", self._bind)
        self.list = Gtk.ListView(model=self.selection, factory=factory, single_click_activate=False,
                                 css_classes=["navigation-sidebar"])
        self.list.connect("activate", lambda _v, pos: self._open(self.selection.get_item(pos).entry))
        self.empty = Adw.StatusPage(icon_name="folder-symbolic", title="Empty folder")
        self.spinner = Adw.Spinner(halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER, width_request=32, height_request=32)
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=self.list), "list")
        self.stack.add_named(self.empty, "empty")
        self.stack.add_named(self.spinner, "loading")
        self.error = Gtk.Label(wrap=True, visible=False, xalign=0, css_classes=["error"], margin_start=12,
                               margin_end=12, margin_bottom=6)

        main = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        for w in (bar, tools, self.stack, self.error):
            main.append(w)
        body = Gtk.Paned(start_child=side, end_child=main, shrink_start_child=False, resize_start_child=False,
                         position=210)

        # bottom: what you will get, Cancel / Choose
        self.choice = Gtk.Label(xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.START,
                                css_classes=["dim-label"])
        cancel = Gtk.Button(label="Cancel")
        cancel.connect("clicked", lambda *_: self.close())
        self.ok = Gtk.Button(label="Choose", css_classes=["suggested-action"])
        self.ok.connect("clicked", lambda *_: self._choose())
        bottom = Gtk.Box(spacing=8, margin_top=8, margin_bottom=8, margin_start=12, margin_end=12)
        for w in (self.choice, cancel, self.ok):
            bottom.append(w)

        tv = Adw.ToolbarView(content=body)
        tv.add_top_bar(Adw.HeaderBar())
        tv.add_bottom_bar(bottom)
        self.set_child(tv)

        shortcuts(self, ("<Control>l", lambda: self.type_btn.set_active(True)),
                  ("<Control>h", lambda: self.hidden.set_active(not self.hidden.get_active())),
                  ("<Alt>Up", self.go_up))

        self._load_places()
        self.go(start or "~")

    # -- places ----------------------------------------------------------------------------
    def _load_places(self) -> None:
        if self.s.cfg.id not in _places:
            self._fill_places([Place("Home", "~")])
        load_places(self.s, self._fill_places)

    def _fill_places(self, found: list[Place]) -> None:
        self.sidebar.remove_all()
        sections = [("Places", found), ("Projects", self.extra)]
        for title, items in sections:
            if not items:
                continue
            head = Gtk.ListBoxRow(selectable=False, activatable=False)
            head.set_child(Gtk.Label(label=title, xalign=0, css_classes=["heading", "dim-label"], margin_top=8,
                                     margin_start=6))
            self.sidebar.append(head)
            for p in items:
                row = Gtk.ListBoxRow(tooltip_text=p.path)
                box = Gtk.Box(spacing=8, margin_top=4, margin_bottom=4)
                icon = "user-home-symbolic" if p.label == "Home" else \
                    "folder-symbolic" if title == "Projects" else "drive-harddisk-symbolic"
                box.append(Gtk.Image(icon_name=icon))
                box.append(Gtk.Label(label=p.label, xalign=0, ellipsize=Pango.EllipsizeMode.END))
                row.set_child(box)
                row.path = p.path
                self.sidebar.append(row)

    # -- browsing --------------------------------------------------------------------------
    def go(self, path: str) -> None:
        self.token += 1
        token, s = self.token, self.s
        self.stack.set_visible_child_name("loading")

        def work():
            home = self.home or remote_fs.home(s.ssh)
            target = home + path[1:] if path.startswith("~") else path
            target = posixpath.normpath(target) if target else home
            return home, target, remote_fs.list_dir(s.ssh, target)

        def done(result, err):
            if token != self.token:
                return
            if err:
                self._error(err)
                self.stack.set_visible_child_name("list" if self.store.get_n_items() else "empty")
                return
            self.error.set_visible(False)
            self.home, self.path, entries = result
            self.store.splice(0, self.store.get_n_items(), [Item(e) for e in entries])
            self.search.set_text("")
            self.selection.set_selected(Gtk.INVALID_LIST_POSITION)
            self._crumbs()
            self.type_btn.set_active(False)
            self._refresh_empty()
            self._sync()

        bg(work, done)

    def _refilter(self) -> None:
        self.filter.changed(Gtk.FilterChange.DIFFERENT)
        if self.stack.get_visible_child_name() != "loading":
            self._refresh_empty()

    def _refresh_empty(self) -> None:
        shown = self.selection.get_n_items()
        self.stack.set_visible_child_name("list" if shown else "empty")
        hidden = self.store.get_n_items() - shown
        self.empty.set_description(f"{hidden} hidden or filtered" if hidden else "")

    def go_up(self) -> None:
        if self.path and self.path != "/":
            self.go(posixpath.dirname(self.path.rstrip("/")) or "/")

    def _open(self, e: Entry) -> None:
        if e.is_dir:
            self.go(posixpath.join(self.path, e.name))

    def _typed(self) -> None:
        text = self.entry.get_text().strip()
        if text:
            self.go(text)

    def _typing(self, on: bool) -> None:
        self.path_stack.set_visible_child_name("entry" if on else "crumbs")
        if on:
            self.entry.set_text(self.path)
            self.entry.grab_focus()

    def _crumbs(self) -> None:
        while child := self.crumbs.get_first_child():
            self.crumbs.remove(child)
        parts = [p for p in self.path.split("/") if p]
        # start from ~ when inside home, so the bar stays short
        if self.home and (self.path == self.home or self.path.startswith(self.home + "/")):
            base, parts = self.home, [p for p in self.path[len(self.home):].split("/") if p]
            first = ("Home", base, "user-home-symbolic")
        else:
            base, first = "", ("/", "/", "drive-harddisk-symbolic")
        label, target, icon = first
        b = Gtk.Button(child=Adw.ButtonContent(label=label, icon_name=icon))
        b.connect("clicked", lambda *_, t=target: self.go(t))
        self.crumbs.append(b)
        for i, part in enumerate(parts):
            target = (base.rstrip("/") + "/" + "/".join(parts[:i + 1])) or "/"
            b = Gtk.Button(label=part)
            if i == len(parts) - 1:
                b.add_css_class("suggested-action")
            b.connect("clicked", lambda *_, t=target: self.go(t))
            self.crumbs.append(b)
        GLib.idle_add(lambda: self._scroll_end() and False)

    def _scroll_end(self) -> None:
        scroller = self.path_stack.get_child_by_name("crumbs")
        adj = scroller.get_hadjustment()
        adj.set_value(adj.get_upper())

    # -- list rows ---------------------------------------------------------------------------
    def _visible(self, item: Item) -> bool:
        name = item.entry.name
        if name.startswith(".") and not self.hidden.get_active():
            return False
        q = self.search.get_text().lower()
        return not q or q in name.lower()

    def _setup(self, _f, li) -> None:
        box = Gtk.Box(spacing=10, margin_top=3, margin_bottom=3)
        box.append(Gtk.Image())
        box.append(Gtk.Label(xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.MIDDLE))
        box.append(Gtk.Label(css_classes=["dim-label", "caption", "numeric"]))
        li.set_child(box)

    def _bind(self, _f, li) -> None:
        e: Entry = li.get_item().entry
        icon = li.get_child().get_first_child()
        name = icon.get_next_sibling()
        when = name.get_next_sibling()
        icon.set_from_icon_name("folder-symbolic" if e.is_dir else "text-x-generic-symbolic")
        name.set_label(e.name)
        when.set_label(time.strftime("%Y-%m-%d", time.localtime(e.mtime)))
        li.get_child().set_opacity(1.0 if e.is_dir else 0.45)  # files show, but you pick folders
        li.set_activatable(e.is_dir)
        li.set_selectable(e.is_dir)

    # -- result ------------------------------------------------------------------------------
    def target(self) -> str:
        item = self.selection.get_selected_item()
        if item and item.entry.is_dir:
            return posixpath.join(self.path, item.entry.name)
        return self.path

    def _sync(self) -> None:
        t = self.target()
        self.ok.set_sensitive(bool(t))
        self.choice.set_label(f"Choose: {short(t, self.home)}" if t else "")

    def _choose(self) -> None:
        t = self.target()
        if t:
            self.close()
            self.on_pick(t)

    def new_folder(self) -> None:
        if not self.path:
            return

        def create(name: str) -> None:
            path = posixpath.join(self.path, name)
            bg(lambda: remote_fs.mkdir(self.s.ssh, path),
               lambda _r, err: self._error(err) if err else self.go(path))
        ask_name(self, "New folder", "Create", create, body=f"Inside {self.path}")

    def _error(self, err: str) -> None:
        self.error.set_label(err)
        self.error.set_visible(True)
