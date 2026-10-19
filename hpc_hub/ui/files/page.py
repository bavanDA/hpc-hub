"""FilesPage: the file pane, the preview beside it, copy and paste, and transfers."""

import posixpath
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ... import remote_fs, transfer
from ...remote_fs import Entry
from ...session import ClusterSession, State
from ..preview import Preview
from ..widgets import bg, remember_size
from .actions import TEXT
from .pane import FilePane
from .transfers import TransferRow


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
        self.preview = Preview(TEXT, toast)
        self.split = remember_size(Gtk.Paned(start_child=self.pane, vexpand=True, wide_handle=True,
                                             resize_start_child=True, resize_end_child=True,
                                             shrink_end_child=False), "files.preview", 560)
        self.append(self.split)
        self.preview_on = Gtk.ToggleButton(icon_name="view-dual-symbolic", active=True, css_classes=["flat"],
                                           tooltip_text="Preview a file when you select it")
        self.preview_on.connect("toggled", lambda *_: self._preview(self.pane.selected()))
        self.pane.nav.append(self.preview_on)
        self.pane.on_select = self._preview
        self.pane.on_paste = self.paste
        self.pane.can_paste = lambda: self.clip is not None

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
        """The preview panel only shows while a file is selected. Unsaved edits are asked about first."""
        self.preview.leave(lambda: self._show_preview(e))

    def _show_preview(self, e: Entry | None) -> None:
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
        if not src.connected:
            self.toast(f"Connect to {src.cfg.name} first, the copy comes from there")
            return
        self.clip = None
        self.banner.set_revealed(False)
        name = posixpath.basename(src_path.rstrip("/"))
        if src is dst:
            self.toast(f"Copying {name}…")
            bg(lambda: remote_fs.copy(src.ssh, src_path, dest_dir), pane._done(f"Copied {name}"))
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

        bg(lambda: transfer.copy(src.ssh, src_path, dst.ssh, dest_dir, progress, on_update), done)
