"""Files side panel: preview the selected file (PDF, image, text)."""

import posixpath
import threading

from gi.repository import Adw, Gdk, GLib, Gtk, GtkSource

from .. import remote_fs
from ..remote_fs import Entry
from ..session import ClusterSession
from .editor import source_view
from .pdf import PdfView

IMAGES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp")
TEXT_LIMIT = 512 * 1024
MEDIA_LIMIT = 60 * 1024 * 1024


class Preview(Gtk.Stack):
    def __init__(self, text_ext: tuple[str, ...]):
        super().__init__(hexpand=True, width_request=360)
        self.text_ext = text_ext
        self.token = 0
        self.info = Adw.StatusPage(icon_name="document-open-symbolic", title="Preview",
                                   description="Select a PDF, image or text file.")
        self.loading = Adw.Spinner(halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER, width_request=32,
                                   height_request=32)
        self.pdf = PdfView()
        self.picture = Gtk.Picture(content_fit=Gtk.ContentFit.CONTAIN)
        self.text = source_view("x.txt")
        self.text.set_editable(False)
        self.add_named(self.info, "info")
        self.add_named(self.loading, "loading")
        self.add_named(self.pdf, "pdf")
        self.add_named(self.picture, "image")
        self.add_named(Gtk.ScrolledWindow(child=self.text), "text")

    def message(self, title: str, text: str = "", icon: str = "document-open-symbolic") -> None:
        self.token += 1
        self.info.set_title(title)
        self.info.set_description(GLib.markup_escape_text(text))
        self.info.set_icon_name(icon)
        self.set_visible_child_name("info")

    def show(self, s: ClusterSession, path: str, e: Entry | None) -> None:
        if not e:
            self.message("Preview", "Select a PDF, image or text file.")
            return
        if e.is_dir:
            self.message(e.name, "Folder", "folder-symbolic")
            return
        name = e.name.lower()
        ext = posixpath.splitext(name)[1]
        kind = "pdf" if ext == ".pdf" else "image" if ext in IMAGES else "text" if ext in self.text_ext else ""
        if not kind:
            self.message(e.name, f"{GLib.format_size(e.size)}. No preview for this type, double-click to download.",
                         "text-x-generic-symbolic")
            return
        limit = TEXT_LIMIT if kind == "text" else MEDIA_LIMIT
        if kind != "text" and e.size > limit:
            self.message(e.name, f"{GLib.format_size(e.size)} is too big to preview. Double-click to open it.")
            return
        self.token += 1
        token = self.token
        self.set_visible_child_name("loading")

        def work():
            try:
                data, err = remote_fs.head_bytes(s.ssh, path, limit), ""
            except Exception as ex:  # noqa: BLE001
                data, err = b"", str(ex)
            GLib.idle_add(lambda: self._loaded(token, kind, e, data, err) and False)

        threading.Thread(target=work, daemon=True).start()

    def _loaded(self, token: int, kind: str, e: Entry, data: bytes, err: str) -> None:
        if token != self.token:
            return  # you already picked another file
        if err:
            self.message(e.name, err, "dialog-error-symbolic")
            return
        if kind != "text" and len(data) > MEDIA_LIMIT:
            self.message(e.name, "Too big to preview. Double-click to open it.")
            return
        if kind == "pdf":
            self.pdf.load_bytes(data, keep_position=False)
            self.set_visible_child_name("pdf")
            GLib.timeout_add(150, lambda: self.pdf.fit_width() and False)
        elif kind == "image":
            try:
                self.picture.set_paintable(Gdk.Texture.new_from_bytes(GLib.Bytes.new(data)))
            except GLib.Error as ex:
                self.message(e.name, ex.message, "dialog-error-symbolic")
                return
            self.set_visible_child_name("image")
        else:
            buf = self.text.get_buffer()
            buf.set_language(GtkSource.LanguageManager.get_default().guess_language(e.name, None))
            cut = len(data) > TEXT_LIMIT
            buf.set_text(data[:TEXT_LIMIT].decode("utf-8", "replace") + ("\n… (first 512 KB only)" if cut else ""))
            self.set_visible_child_name("text")
