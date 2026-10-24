"""What you can do to a file in the Files tab: open, edit, download, upload, rename, delete, zip."""

import posixpath
from pathlib import Path

from gi.repository import Adw, Gdk, Gio, GLib, Gtk

from ...pdf.ui.poppler import PdfDialog
from ...ui.widgets import ask_name, bg
from .. import remote_fs
from ..remote_fs import Entry
from .editor import EditorDialog
from .preview import IMAGES

DOWNLOADS = Path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or Path.home()) / "HPC Hub"
TEXT = (".txt", ".md", ".py", ".sh", ".tex", ".bib", ".sty", ".cls", ".json", ".yaml", ".yml", ".toml", ".cfg",
        ".ini", ".csv", ".tsv", ".log", ".out", ".err", ".c", ".h", ".cpp", ".hpp", ".cu", ".java", ".js", ".ts",
        ".r", ".jl", ".m", ".slurm", ".sbatch", ".bashrc", ".conf", ".xml", ".html", ".css", ".rs", ".go", "")


class FileActionsMixin:
    """FilePane's actions on the selected entry (or the folder you are in)."""

    def open_entry(self, e: Entry) -> None:
        if e.is_dir:
            self.go(self.child(e))
            return
        s, path, ext = self.session, self.child(e), remote_fs.ext(e.name)
        root = self.get_root()
        if ext == ".pdf":
            bg(lambda: remote_fs.read_bytes(s.ssh, path),
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
            bg(lambda: remote_fs.read_bytes(s.ssh, path), show)
        elif ext in TEXT and e.size < 8 * 1024 * 1024:
            EditorDialog(s, path).present(root)
        else:
            self.download(e, open_after=True)

    def edit(self, e: Entry) -> None:
        EditorDialog(self.session, self.child(e)).present(self.get_root())

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
        bg(lambda: remote_fs.download(s.ssh, self.child(e), str(dest)), done)

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
            bg(lambda: [remote_fs.upload(s.ssh, p, here) for p in paths], self._done("Upload finished"))

        dialog.open_multiple(self.get_root(), None, picked)

    def new_folder(self) -> None:
        if not self._connected() or not self.path:
            return
        s = self.session
        ask_name(self.get_root(), "New folder", "Create", lambda name: bg(
            lambda: remote_fs.mkdir(s.ssh, posixpath.join(self.path, name)), self._done(f"Created {name}")))

    def rename(self, e: Entry) -> None:
        s = self.session
        ask_name(self.get_root(), f"Rename {e.name}", "Rename", lambda name: bg(
            lambda: remote_fs.rename(s.ssh, self.child(e), posixpath.join(self.path, name)),
            self._done(f"Renamed to {name}")), text=e.name)

    def delete(self, e: Entry) -> None:
        s = self.session
        d = Adw.AlertDialog(heading=f"Delete {e.name}?",
                            body=f"This permanently deletes it on {s.cfg.name}" + (" with everything inside." if e.is_dir else "."))
        d.add_response("cancel", "Cancel")
        d.add_response("delete", "Delete")
        d.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_close_response("cancel")
        d.connect("response", lambda _d, r: r == "delete" and bg(
            lambda: remote_fs.remove(s.ssh, self.child(e)), self._done(f"Deleted {e.name}")))
        d.present(self.get_root())

    def zip_or_extract(self, e: Entry) -> None:
        s, path = self.session, self.child(e)
        if remote_fs.ext(e.name) in remote_fs.ARCHIVES:
            self.toast(f"Extracting {e.name}…")
            bg(lambda: remote_fs.extract(s.ssh, path), self._done(f"Extracted {e.name}"))
        else:
            self.toast(f"Zipping {e.name} on {s.cfg.name}…")
            bg(lambda: remote_fs.make_zip(s.ssh, path), self._done(f"Zipped {e.name}"))
