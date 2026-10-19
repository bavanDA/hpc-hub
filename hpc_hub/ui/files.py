"""Files tab: browse a cluster, open/zip/rename/delete, copy here and paste on any cluster."""

import posixpath
import threading
import time
from collections.abc import Callable
from pathlib import Path

from gi.repository import Adw, Gdk, Gio, GLib, GObject, Gtk, Pango

from .. import remote_fs, transfer
from ..remote_fs import Entry
from ..session import ClusterSession, State
from .editor import EditorDialog
from .pdf import PdfDialog
from .preview import Preview
from .widgets import remember_size

DOWNLOADS = Path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or Path.home()) / "HPC Hub"
IMAGES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp")
TEXT = (".txt", ".md", ".py", ".sh", ".tex", ".bib", ".sty", ".cls", ".json", ".yaml", ".yml", ".toml", ".cfg",
        ".ini", ".csv", ".tsv", ".log", ".out", ".err", ".c", ".h", ".cpp", ".hpp", ".cu", ".java", ".js", ".ts",
        ".r", ".jl", ".m", ".slurm", ".sbatch", ".bashrc", ".conf", ".xml", ".html", ".css", ".rs", ".go", "")
ARCHIVES = (".zip", ".tar.gz", ".tgz", ".tar", ".tar.bz2", ".tar.xz")


def _ext(name: str) -> str:
    low = name.lower()
    for multi in (".tar.gz", ".tar.bz2", ".tar.xz"):
        if low.endswith(multi):
            return multi
    return posixpath.splitext(low)[1]


def _bg(work: Callable[[], object], done: Callable[[object, str], None]) -> None:
    """Run work() on a thread, then done(result, error) on the main loop."""
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


class EntryItem(GObject.Object):
    def __init__(self, entry: Entry):
        super().__init__()
        self.entry = entry


class FilePane(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None], index: int,
                 on_copy: Callable[["FilePane", Entry], None], on_latex: Callable[[ClusterSession, str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        self.sessions = sessions
        self.toast = toast
        self.on_copy = on_copy
        self.on_latex = on_latex
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
        if attr == "name":
            icon, label = item.get_child().get_first_child(), item.get_child().get_last_child()
            icon.set_from_icon_name("folder-symbolic" if e.is_dir else
                                    "x-office-document-symbolic" if _ext(e.name) == ".pdf" else "text-x-generic-symbolic")
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
        if s.state == State.CONNECTED and s.ssh:
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
            target = path or remote_fs.home(s.ssh)
            if target.startswith("~"):
                target = remote_fs.home(s.ssh) + target[1:]
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
        _bg(work, done)

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
        for key, b in self.actions.items():
            b.set_sensitive(ok)
        if e:
            is_archive = _ext(e.name) in ARCHIVES
            self.actions["zip"].set_tooltip_text("Extract here" if is_archive else "Zip on the cluster")
            self.actions["zip"].set_icon_name("extract-archive-symbolic" if is_archive else "package-x-generic-symbolic")
            self.actions["latex"].set_visible(_ext(e.name) == ".tex")
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

    def open_entry(self, e: Entry) -> None:
        if e.is_dir:
            self.go(self.child(e))
            return
        s, path, ext = self.session, self.child(e), _ext(e.name)
        root = self.get_root()
        if ext == ".pdf":
            _bg(lambda: remote_fs.read_bytes(s.ssh, path),
                lambda data, err: self.toast(err) if err else PdfDialog(e.name, data).present(root))
        elif ext in IMAGES:
            def show(data, err):
                if err:
                    self.toast(err)
                    return
                pic = Gtk.Picture.new_for_paintable(Gdk.Texture.new_from_bytes(GLib.Bytes.new(data)))
                tv = Adw.ToolbarView(content=Gtk.ScrolledWindow(child=pic))
                tv.add_top_bar(Adw.HeaderBar())
                Adw.Dialog(title=e.name, content_width=900, content_height=700, child=tv).present(root)
            _bg(lambda: remote_fs.read_bytes(s.ssh, path), show)
        elif ext in TEXT and e.size < 8 * 1024 * 1024:
            EditorDialog(s, path).present(root)
        else:
            self.download(e, open_after=True)

    def download(self, e: Entry, open_after: bool = False) -> None:
        s = self.session
        dest = DOWNLOADS / s.cfg.id
        dest.mkdir(parents=True, exist_ok=True)
        self.toast(f"Downloading {e.name}…")

        def done(_r, err):
            if err:
                self.toast(f"Download failed: {err}")
                return
            target = Gio.File.new_for_path(str(dest / e.name))
            if open_after:
                Gtk.FileLauncher.new(target).launch(self.get_root(), None, None, None)
            else:
                self.toast(f"Saved to {dest / e.name}")
        _bg(lambda: remote_fs.download(s.ssh, self.child(e), str(dest)), done)

    def upload(self) -> None:
        if not self._connected() or not self.path:
            return
        s, here = self.session, self.path
        dialog = Gtk.FileDialog(title=f"Upload to {s.cfg.name}:{here}")

        def picked(d, res):
            try:
                files = d.open_multiple_finish(res)
            except GLib.Error:
                return
            paths = [files.get_item(i).get_path() for i in range(files.get_n_items())]
            self.toast(f"Uploading {len(paths)} item(s)…")
            _bg(lambda: [remote_fs.upload(s.ssh, p, here) for p in paths], self._done("Upload finished"))

        dialog.open_multiple(self.get_root(), None, picked)

    def _ask_name(self, heading: str, initial: str, confirm: str, then: Callable[[str], None]) -> None:
        d = Adw.AlertDialog(heading=heading)
        entry = Gtk.Entry(text=initial, activates_default=True)
        d.set_extra_child(entry)
        d.add_response("cancel", "Cancel")
        d.add_response("ok", confirm)
        d.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        d.set_default_response("ok")

        def on_response(_d, r):
            name = entry.get_text().strip()
            if r == "ok" and name and "/" not in name:
                then(name)

        d.connect("response", on_response)
        d.present(self.get_root())

    def new_folder(self) -> None:
        if not self._connected() or not self.path:
            return
        s = self.session
        self._ask_name("New folder", "", "Create", lambda name: _bg(
            lambda: remote_fs.mkdir(s.ssh, posixpath.join(self.path, name)), self._done(f"Created {name}")))

    def rename(self, e: Entry) -> None:
        s = self.session
        self._ask_name(f"Rename {e.name}", e.name, "Rename", lambda name: _bg(
            lambda: remote_fs.rename(s.ssh, self.child(e), posixpath.join(self.path, name)),
            self._done(f"Renamed to {name}")))

    def delete(self, e: Entry) -> None:
        s = self.session
        d = Adw.AlertDialog(heading=f"Delete {e.name}?",
                            body=f"This permanently deletes it on {s.cfg.name}" + (" with everything inside." if e.is_dir else "."))
        d.add_response("cancel", "Cancel")
        d.add_response("delete", "Delete")
        d.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_close_response("cancel")
        d.connect("response", lambda _d, r: r == "delete" and _bg(
            lambda: remote_fs.remove(s.ssh, self.child(e)), self._done(f"Deleted {e.name}")))
        d.present(self.get_root())

    def zip_or_extract(self, e: Entry) -> None:
        s, path = self.session, self.child(e)
        if _ext(e.name) in ARCHIVES:
            self.toast(f"Extracting {e.name}…")
            _bg(lambda: remote_fs.extract(s.ssh, path), self._done(f"Extracted {e.name}"))
        else:
            self.toast(f"Zipping {e.name} on {s.cfg.name}…")
            _bg(lambda: remote_fs.make_zip(s.ssh, path), self._done(f"Zipped {e.name}"))


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


class FilesPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None],
                 on_latex: Callable[[ClusterSession, str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions = sessions
        self.toast = toast
        self.clip: tuple[ClusterSession, str] | None = None  # (cluster, path) waiting to be pasted
        self.banner = Adw.Banner(button_label="Paste here")
        self.banner.connect("button-clicked", lambda *_: self.paste())
        self.append(self.banner)
        self.pane = FilePane(sessions, toast, 0, self.copy, on_latex)
        self.preview = Preview(TEXT)
        self.split = remember_size(Gtk.Paned(start_child=self.pane, vexpand=True, wide_handle=True,
                                             resize_start_child=True, resize_end_child=True,
                                             shrink_end_child=False), "files.preview", 560)
        self.append(self.split)
        self.preview_on = Gtk.ToggleButton(icon_name="view-dual-symbolic", active=True, css_classes=["flat"],
                                           tooltip_text="Preview a file when you select it")
        self.preview_on.connect("toggled", lambda *_: self._preview(self.pane.selected()))
        self.pane.nav.append(self.preview_on)
        self.pane.on_select = self._preview

        self.transfers = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.revealer = Gtk.Revealer(child=Gtk.ScrolledWindow(child=self.transfers, max_content_height=180,
                                                             propagate_natural_height=True,
                                                             margin_start=8, margin_end=8, margin_bottom=8))
        self.append(self.revealer)
        self.connect("map", lambda *_: self.pane.path or self.pane.go(""))

    def show_cluster(self, session: ClusterSession) -> None:
        if self.pane.session is session:
            self.pane.refresh()
        else:
            self.pane.set_session(session)

    def _preview(self, e: Entry | None) -> None:
        """The preview panel only shows while a file is selected."""
        show = e is not None and not e.is_dir and self.preview_on.get_active()
        if show:
            if self.split.get_end_child() is None:
                self.split.set_end_child(self.preview)
            self.preview.show(self.pane.session, self.pane.child(e), e)
        elif self.split.get_end_child() is not None:
            self.preview.message("Preview")  # also drops any load still running
            self.split.set_end_child(None)

    def open_at(self, session: ClusterSession, folder: str) -> None:
        self.pane.paths[session.cfg.id] = folder
        if self.pane.session is session:
            self.pane.go(folder)
        else:
            self.pane.set_session(session)

    def session_changed(self, session: ClusterSession) -> None:
        if self.pane.session is not session:
            return
        if session.state == State.CONNECTED:
            if self.pane.get_mapped():
                self.pane.go(self.pane.paths.get(session.cfg.id, ""))
        else:
            self.pane._connected()

    def copy(self, pane: FilePane, e: Entry) -> None:
        self.clip = (pane.session, pane.child(e))
        self.banner.set_title(GLib.markup_escape_text(
            f"Copied {e.name} from {pane.session.cfg.name}. Open any folder on any cluster, then paste."))
        self.banner.set_revealed(True)

    def paste(self) -> None:
        if not self.clip:
            return
        pane = self.pane
        src, src_path = self.clip
        dst, dest_dir = pane.session, pane.path
        if dst.state != State.CONNECTED or not dest_dir:
            self.toast("Open a folder to paste into first")
            return
        if src.state != State.CONNECTED or not src.ssh:
            self.toast(f"Connect to {src.cfg.name} first, the copy comes from there")
            return
        self.clip = None
        self.banner.set_revealed(False)
        name = posixpath.basename(src_path.rstrip("/"))
        if src is dst:
            self.toast(f"Copying {name}…")
            cmd = f"cp -r -- {remote_fs.q(src_path)} {remote_fs.q(dest_dir)}/"
            _bg(lambda: remote_fs._run(src.ssh, cmd, timeout=3600), pane._done(f"Copied {name}"))
            return
        self.direct_copy(src, src_path, dst, dest_dir, pane)

    def direct_copy(self, src: ClusterSession, src_path: str, dst: ClusterSession, dest_dir: str,
                    dst_pane: FilePane | None = None) -> None:
        name = posixpath.basename(src_path.rstrip("/"))
        progress = transfer.Progress()
        row = TransferRow(f"{name}: {src.cfg.name} → {dst.cfg.name}:{dest_dir}", progress)
        self.transfers.prepend(row)
        self.revealer.set_reveal_child(True)
        row.update("Starting…")
        last = {"t": 0.0}

        def on_update(p):
            now = time.monotonic()
            if p.finished or now - last["t"] > 0.3:
                last["t"] = now
                GLib.idle_add(lambda: row.update() and False)

        def done(_r, err):
            row.update(f"Failed: {err}" if err else f"Done · {GLib.format_size(progress.done)}")
            if not err and dst_pane:
                dst_pane.refresh()
            self.toast(f"Copy failed: {err}" if err else f"Copied {name} to {dst.cfg.name}")

        _bg(lambda: transfer.copy(src.ssh, src_path, dst.ssh, dest_dir, progress, on_update), done)
