"""Project files as a tree, like Overleaf: folders open and close, drag to move, right-click to manage."""

import posixpath
import shlex
from collections.abc import Callable

from gi.repository import Adw, Gdk, Gio, GObject, Gtk, Pango

from ... import remote_fs
from ..widgets import ask_name, bg

BUILD_OUTPUT = (".aux", ".log", ".out", ".toc", ".fls", ".fdb_latexmk", ".synctex.gz", ".bbl", ".blg", ".lof",
                ".lot", ".nav", ".snm", ".bcf", ".run.xml", ".xdv")
FIG_EXT = (".png", ".jpg", ".jpeg", ".pdf", ".eps", ".svg")

# "d path" / "f path" for everything in the project, minus hidden folders and LaTeX's own output
LIST = ("find . -maxdepth 6 \\( -name '.?*' -o -name _minted\\* \\) -prune -o -mindepth 1 \\( -type d -printf 'd %P\\n' "
        "-o -type f " + " ".join(f"! -name '*{e}'" for e in BUILD_OUTPUT) + " -printf 'f %P\\n' \\) "
        "| sort -k2 | head -3000")


def list_tree(ssh, folder: str) -> list[tuple[str, str]]:
    out = ssh.run(f"cd {shlex.quote(folder)} && {LIST}", timeout=60).stdout
    return [(line[0], line[2:]) for line in out.splitlines() if len(line) > 2 and line[1] == " "]


class Node(GObject.Object):
    def __init__(self, rel: str, is_dir: bool):
        super().__init__()
        self.rel, self.is_dir = rel, is_dir
        self.name = posixpath.basename(rel)
        self.children = Gio.ListStore(item_type=Node) if is_dir else None


def build_nodes(entries: list[tuple[str, str]]) -> Gio.ListStore:
    """Folders first, then files, each sorted by name, at every level."""
    root = Gio.ListStore(item_type=Node)
    dirs: dict[str, Node] = {}
    for kind, rel in sorted(entries, key=lambda e: (e[1].count("/"), e[0] != "d", e[1].lower())):
        node = Node(rel, kind == "d")
        if node.is_dir:
            dirs[rel] = node
        parent = dirs.get(posixpath.dirname(rel))
        (parent.children if parent else root).append(node)
    return root


def icon_for(node: Node) -> str:
    if node.is_dir:
        return "folder-symbolic"
    low = node.name.lower()
    return ("x-office-document-symbolic" if low.endswith(".tex") else "image-x-generic-symbolic"
            if low.endswith(FIG_EXT) else "text-x-generic-symbolic")


class FileTree(Gtk.Box):
    """page gives session, folder, main, current, toast; on_open(rel) opens a file."""

    def __init__(self, page, on_open: Callable[[str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.page, self.on_open = page, on_open
        self.expanded: set[str] = set()
        self.selected_rel = ""

        bar = Gtk.Box(spacing=2, margin_top=6, margin_bottom=4, margin_start=10, margin_end=4)
        bar.append(Gtk.Label(label="Files", xalign=0, hexpand=True, css_classes=["heading"]))
        for icon, tip, fn in (("document-new-symbolic", "New file", lambda: self.new_file()),
                              ("folder-new-symbolic", "New folder", lambda: self.new_folder()),
                              ("document-send-symbolic", "Upload files", lambda: self.upload()),
                              ("view-refresh-symbolic", "Refresh", lambda: self.refresh())):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: f())
            bar.append(b)
        self.append(bar)

        self.root = Gio.ListStore(item_type=Node)
        self.model = Gtk.TreeListModel.new(self.root, False, False, lambda n: n.children if n.is_dir else None)
        self.selection = Gtk.SingleSelection(model=self.model, autoselect=False, can_unselect=True)
        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", self._setup)
        factory.connect("bind", self._bind)
        self.view = Gtk.ListView(model=self.selection, factory=factory, css_classes=["navigation-sidebar"])
        self.view.connect("activate", lambda _v, pos: self._activate(pos))
        scroller = Gtk.ScrolledWindow(child=self.view, vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER)
        self.append(scroller)
        self.append(Gtk.Label(label="Drag files to move them, or drop files from your computer to upload.",
                              wrap=True, xalign=0, css_classes=["dim-label", "caption"], margin_start=10,
                              margin_end=8, margin_bottom=8))
        self._drops(scroller, lambda: "")  # empty space = the project's top folder
        self._menu()

    # -- data --------------------------------------------------------------------------------
    def refresh(self) -> None:
        s, folder = self.page.session, self.page.folder
        if not s or not folder:
            return
        bg(lambda: list_tree(s.ssh, folder), lambda entries, err: self.show(entries) if entries is not None
           and folder == self.page.folder else err and self.page.toast(err))

    def show(self, entries: list[tuple[str, str]]) -> None:
        self.page.files = [rel for kind, rel in entries if kind == "f"]
        self.expanded = {self.model.get_item(i).get_item().rel for i in range(self.model.get_n_items())
                         if self.model.get_item(i).get_expanded()}  # keep open what you had open
        self.root.remove_all()
        fresh = build_nodes(entries)
        for i in range(fresh.get_n_items()):
            self.root.append(fresh.get_item(i))
        self._restore()

    def _restore(self) -> None:
        """Open the folders you had open (and the one holding the current file), select the current file."""
        current = self.page.current_rel()
        want = set(self.expanded)
        parts = current.split("/")[:-1]
        want |= {"/".join(parts[:k]) for k in range(1, len(parts) + 1)}
        i = 0
        while i < self.model.get_n_items():
            row = self.model.get_item(i)
            node = row.get_item()
            if node.is_dir and node.rel in want:
                row.set_expanded(True)
            if node.rel == current:
                self.selection.set_selected(i)
            i += 1

    def mark_current(self) -> None:
        self._restore()

    # -- rows ---------------------------------------------------------------------------------
    def _setup(self, _f, item) -> None:
        box = Gtk.Box(spacing=6)
        box.append(Gtk.Image())
        box.append(Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE))
        expander = Gtk.TreeExpander(child=box, indent_for_icon=True)
        item.set_child(expander)
        drag = Gtk.DragSource(actions=Gdk.DragAction.MOVE)
        drag.connect("prepare", lambda *_: Gdk.ContentProvider.new_for_value(expander.node.rel)
                     if getattr(expander, "node", None) else None)
        expander.add_controller(drag)
        self._drops(expander, lambda: expander.node.rel if expander.node.is_dir else posixpath.dirname(expander.node.rel))

    def _bind(self, _f, item) -> None:
        row = item.get_item()
        node: Node = row.get_item()
        expander = item.get_child()
        expander.set_list_row(row)
        expander.node = node
        icon, label = expander.get_child().get_first_child(), expander.get_child().get_last_child()
        icon.set_from_icon_name(icon_for(node))
        label.set_label(node.name)
        is_main = not node.is_dir and posixpath.join(self.page.folder, node.rel) == self.page.main
        (label.add_css_class if is_main else label.remove_css_class)("heading")
        expander.set_tooltip_text("Main file" if is_main else None)

    def _activate(self, pos: int) -> None:
        row = self.model.get_item(pos)
        node = row.get_item()
        if node.is_dir:
            row.set_expanded(not row.get_expanded())
        else:
            self.on_open(node.rel)

    def _node_at(self, pos: int) -> Node | None:
        row = self.model.get_item(pos) if 0 <= pos < self.model.get_n_items() else None
        return row.get_item() if row else None

    def _here(self) -> str:
        """The folder new things go in: the selected folder, or the selected file's folder."""
        node = self._node_at(self.selection.get_selected())
        if not node:
            return ""
        return node.rel if node.is_dir else posixpath.dirname(node.rel)

    # -- drag and drop ------------------------------------------------------------------------
    def _drops(self, widget: Gtk.Widget, folder: Callable[[], str]) -> None:
        move = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)
        move.connect("drop", lambda _t, rel, *_: self.move(rel, folder()) or True)
        widget.add_controller(move)
        files = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        files.connect("drop", lambda _t, value, *_: self.upload_paths(
            [f.get_path() for f in value.get_files() if f.get_path()], folder()) or True)
        widget.add_controller(files)

    # -- actions ------------------------------------------------------------------------------
    def _run(self, work, ok: str) -> None:
        bg(work, lambda _r, err: (self.page.toast(f"Failed: {err}" if err else ok), self.refresh()))

    def _abs(self, rel: str) -> str:
        return posixpath.join(self.page.folder, rel) if rel else self.page.folder

    def move(self, rel: str, into: str) -> None:
        if not rel or rel == into or into.startswith(rel + "/") or posixpath.dirname(rel) == into:
            return  # onto itself, into its own subfolder, or where it already is
        s, name = self.page.session, posixpath.basename(rel)
        src, dst = self._abs(rel), posixpath.join(self._abs(into), name)
        was_current = self.page.current == src
        self._run(lambda: remote_fs.rename(s.ssh, src, dst), f"Moved {name} to {into or 'the top folder'}")
        if was_current:
            self.page.current = dst
        if self.page.main == src:
            self.page.main = dst

    def new_file(self) -> None:
        here, s = self._here(), self.page.session
        ask_name(self.get_root(), f"New file in {here or 'the top folder'}", "Create", lambda name: self._run(
            lambda: remote_fs.write_bytes(s.ssh, posixpath.join(self._abs(here), name), b""), f"Created {name}"),
            text="untitled.tex")

    def new_folder(self) -> None:
        here, s = self._here(), self.page.session
        ask_name(self.get_root(), f"New folder in {here or 'the top folder'}", "Create", lambda name: self._run(
            lambda: remote_fs.mkdir(s.ssh, posixpath.join(self._abs(here), name)), f"Created {name}"))

    def upload(self) -> None:
        here = self._here()
        dialog = Gtk.FileDialog(title=f"Upload to {here or 'the project'}")

        def picked(d, res):
            try:
                files = d.open_multiple_finish(res)
            except Exception:  # noqa: BLE001 - cancelled
                return
            self.upload_paths([files.get_item(i).get_path() for i in range(files.get_n_items())], here)
        dialog.open_multiple(self.get_root(), None, picked)

    def upload_paths(self, paths: list[str], into: str) -> None:
        if not paths:
            return
        s, dest = self.page.session, self._abs(into)
        self.page.toast(f"Uploading {len(paths)} file(s)…")
        self._run(lambda: [remote_fs.upload(s.ssh, p, dest) for p in paths], f"Uploaded to {into or 'the project'}")

    def rename(self, node: Node) -> None:
        s = self.page.session
        parent = posixpath.dirname(node.rel)

        def go(name):
            src, dst = self._abs(node.rel), posixpath.join(self._abs(parent), name)
            if self.page.current == src:
                self.page.current = dst
            if self.page.main == src:
                self.page.main = dst
            self._run(lambda: remote_fs.rename(s.ssh, src, dst), f"Renamed to {name}")
        ask_name(self.get_root(), f"Rename {node.name}", "Rename", go, text=node.name)

    def delete(self, node: Node) -> None:
        s = self.page.session
        d = Adw.AlertDialog(heading=f"Delete {node.name}?", body="It is removed from the cluster" +
                            (" with everything inside." if node.is_dir else "."))
        d.add_response("cancel", "Cancel")
        d.add_response("delete", "Delete")
        d.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_close_response("cancel")
        d.connect("response", lambda _d, r: r == "delete" and self._run(
            lambda: remote_fs.remove(s.ssh, self._abs(node.rel)), f"Deleted {node.name}"))
        d.present(self.get_root())

    # -- right-click menu ---------------------------------------------------------------------
    def _menu(self) -> None:
        group = Gio.SimpleActionGroup()
        self.target: Node | None = None
        for name, fn in (("open", lambda: self.target and not self.target.is_dir and self.on_open(self.target.rel)),
                         ("rename", lambda: self.target and self.rename(self.target)),
                         ("delete", lambda: self.target and self.delete(self.target)),
                         ("new-file", self.new_file), ("new-folder", self.new_folder), ("upload", self.upload),
                         ("main", lambda: self.target and self.page.set_main(self._abs(self.target.rel))),
                         ("copy-path", lambda: self._copy_path())):
            act = Gio.SimpleAction(name=name)
            act.connect("activate", lambda *_, f=fn: f())
            group.add_action(act)
        self.insert_action_group("tree", group)
        self.popover = Gtk.PopoverMenu(has_arrow=False, halign=Gtk.Align.START)
        self.popover.set_parent(self.view)
        click = Gtk.GestureClick(button=3)
        click.connect("pressed", self._right_click)
        self.view.add_controller(click)

    def _right_click(self, gesture, _n, x, y) -> None:
        gesture.set_state(Gtk.EventSequenceState.CLAIMED)
        w = self.view.pick(x, y, Gtk.PickFlags.DEFAULT)
        while w is not None and not isinstance(w, Gtk.TreeExpander):
            child = w.get_first_child()
            w = child if isinstance(child, Gtk.TreeExpander) else w.get_parent()
        self.target = getattr(w, "node", None) if w else None
        if self.target:
            pos = next((i for i in range(self.model.get_n_items())
                        if self.model.get_item(i).get_item() is self.target), -1)
            if pos >= 0:
                self.selection.set_selected(pos)
        menu = Gio.Menu()
        first, manage = Gio.Menu(), Gio.Menu()
        if self.target and not self.target.is_dir:
            first.append("Open", "tree.open")
            if self.target.name.endswith(".tex"):
                first.append("Set as main file", "tree.main")
        first.append("New file…", "tree.new-file")
        first.append("New folder…", "tree.new-folder")
        first.append("Upload files…", "tree.upload")
        if self.target:
            manage.append("Copy path", "tree.copy-path")
            manage.append("Rename…", "tree.rename")
            manage.append("Delete…", "tree.delete")
        for section in (first, manage):
            if section.get_n_items():
                menu.append_section(None, section)
        self.popover.set_menu_model(menu)
        rect = Gdk.Rectangle()
        rect.x, rect.y, rect.width, rect.height = int(x), int(y), 1, 1
        self.popover.set_pointing_to(rect)
        self.popover.popup()

    def _copy_path(self) -> None:
        path = self._abs(self.target.rel) if self.target else self.page.folder
        self.get_clipboard().set(path)
        self.page.toast(f"Copied {path}")
