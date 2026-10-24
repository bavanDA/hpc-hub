"""Project files beside the editor: list, open, figures, and drag and drop uploads."""

import os
import posixpath
import shlex

from gi.repository import Adw, Gdk, GLib, Gtk, Pango

from ...files import remote_fs
from ...connect.session import ClusterSession
from ...pdf.ui.poppler import PdfDialog
from ..widgets import bg

PROJECT_EXT = (".tex", ".bib", ".sty", ".cls", ".bst")
TEXT_EXT = PROJECT_EXT + (".txt", ".md", ".csv", ".dat", ".py", ".sh")
FIG_EXT = (".png", ".jpg", ".jpeg", ".pdf", ".eps", ".svg")
LIST_EXT = TEXT_EXT + FIG_EXT


def _file_row(name: str, icon: str, depth: int, bold: bool = False, dim: bool = False) -> Gtk.Box:
    box = Gtk.Box(spacing=6, margin_start=6 + 14 * depth)
    box.append(Gtk.Image(icon_name=icon))
    label = Gtk.Label(label=name, xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE)
    if bold:
        label.add_css_class("heading")
    if dim:
        label.add_css_class("dim-label")
    box.append(label)
    return box


class FilesMixin:
    """LatexPage's files: the tree (self.tree), opening files and figures, and drops onto the editor."""

    def current_rel(self) -> str:
        return posixpath.relpath(self.current, self.folder) if self.current and self.folder else ""

    def _fill_files(self) -> None:
        self.tree.mark_current()

    def _refresh_files(self) -> None:
        self.tree.refresh()

    def set_main(self, path: str) -> None:
        """The .tex file that Build compiles (remembered for the project)."""
        self.main = path
        self.title.set_label(f"{self.session.cfg.name}: {self.main}")
        p = self.store.find(self.session.cfg.id, self.folder) if self.store else None
        if p:
            p.main_tex = posixpath.relpath(path, self.folder)
            self.store.changed()
        self.toast(f"Main file: {posixpath.basename(path)}")
        self.sync = None
        self.tree.refresh()

    def _open_listed(self, rel: str) -> None:
        path = posixpath.join(self.folder, rel)
        if rel.lower().endswith(FIG_EXT):
            self._show_figure(path)
            return
        if path != self.current:
            self._switch_to(path)

    def _show_figure(self, path: str) -> None:
        s = self.session

        def done(data, err):
            if err or not data:
                self.toast(err or "Could not read the file")
            elif path.lower().endswith(".pdf"):
                PdfDialog(posixpath.basename(path), data).present(self.get_root())
            else:
                try:
                    tex = Gdk.Texture.new_from_bytes(GLib.Bytes.new(data))
                except GLib.Error:
                    self.toast("This image type can't be shown here")
                    return
                pic = Gtk.Picture(paintable=tex, can_shrink=True, margin_top=12, margin_bottom=12,
                                  margin_start=12, margin_end=12)
                Adw.Dialog(title=posixpath.basename(path), content_width=800, content_height=600,
                           child=pic).present(self.get_root())
        bg(lambda: remote_fs.read_bytes(s.ssh, path), done)

    def _refresh_files(self) -> None:
        s, folder = self.session, self.folder

        def done(files, err):
            if files is not None and folder == self.folder:
                self.files = files
                self._fill_files()
        bg(lambda: self._list_files(s, folder), done)

    # -- drag and drop ----------------------------------------------------------------------
    def _drop_target(self, widget: Gtk.Widget, into_editor: bool) -> None:
        """Drop files from your computer: they are copied to the project (figures/ for images dropped on
        the text, which also gets an includegraphics line)."""
        target = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        target.connect("drop", lambda _t, value, _x, _y: self._dropped(value.get_files(), into_editor) or True)
        widget.add_controller(target)

    def _dropped(self, files, into_editor: bool) -> None:
        if not self.session or not self.folder:
            return
        local = [f.get_path() for f in files if f.get_path()]
        figs_dir = "figures" if any(f.startswith("figures/") for f in self.files) else ""
        dest = posixpath.join(self.folder, figs_dir) if into_editor and figs_dir else self.folder
        s = self.session
        self.toast(f"Uploading {len(local)} file(s)…")

        def work():
            for path in local:
                remote_fs.upload(s.ssh, path, dest)
            return local

        def done(_r, err):
            if err:
                self.toast(f"Upload failed: {err}")
                return
            self.toast(f"Uploaded to {posixpath.relpath(dest, self.folder) if dest != self.folder else 'the project'}")
            if into_editor:
                for path in local:
                    name = posixpath.join(figs_dir, os.path.basename(path)) if figs_dir else os.path.basename(path)
                    stem, ext = posixpath.splitext(name)
                    line = (f"\\includegraphics[width=\\linewidth]{{{stem if ext.lower() != '.svg' else name}}}\n"
                            if ext.lower() in FIG_EXT else f"\\input{{{stem}}}\n" if ext == ".tex" else "")
                    if line:
                        self.buf.insert_at_cursor(line)
            self._refresh_files()
        bg(work, done)
