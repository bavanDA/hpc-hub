"""Files side panel: preview the selected file (PDF, image); text files open in an editor you can save."""

import posixpath

import gi

gi.require_version("GtkSource", "5")
from gi.repository import Adw, Gdk, GLib, Gtk, GtkSource, Pango  # noqa: E402

from .. import remote_fs  # noqa: E402
from ..remote_fs import Entry  # noqa: E402
from ..session import ClusterSession  # noqa: E402
from .editor import source_view  # noqa: E402
from .pdf import PdfView  # noqa: E402
from .widgets import bg, shortcuts  # noqa: E402

IMAGES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp")
TEXT_LIMIT = 512 * 1024
MEDIA_LIMIT = 60 * 1024 * 1024


class Preview(Gtk.Stack):
    def __init__(self, text_ext: tuple[str, ...], toast=lambda text: None):
        super().__init__(hexpand=True, width_request=360)
        self.text_ext = text_ext
        self.toast = toast
        self.token = 0
        self.editing: tuple[ClusterSession, str] | None = None  # the text file in the editor
        self.dirty = False
        self._filling = False
        self.info = Adw.StatusPage(icon_name="document-open-symbolic", title="Preview",
                                   description="Select a PDF, image or text file.")
        self.loading = Adw.Spinner(halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER, width_request=32,
                                   height_request=32)
        self.pdf = PdfView()
        self.picture = Gtk.Picture(content_fit=Gtk.ContentFit.CONTAIN)
        self.text = source_view("x.txt")
        self.text.get_buffer().connect("changed", self._changed)
        self.name = Gtk.Label(xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.MIDDLE, css_classes=["heading"])
        self.save_btn = Gtk.Button(label="Save", css_classes=["suggested-action"], sensitive=False,
                                   tooltip_text="Save to the cluster (Ctrl+S)")
        self.save_btn.connect("clicked", lambda *_: self.save())
        bar = Gtk.Box(spacing=6, margin_top=6, margin_bottom=6, margin_start=10, margin_end=6)
        bar.append(self.name)
        bar.append(self.save_btn)
        editor = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        editor.append(bar)
        editor.append(Gtk.ScrolledWindow(child=self.text, vexpand=True))
        shortcuts(editor, ("<Control>s", self.save))
        self.add_named(self.info, "info")
        self.add_named(self.loading, "loading")
        self.add_named(self.pdf, "pdf")
        self.add_named(self.picture, "image")
        self.add_named(editor, "text")

    # -- editing ------------------------------------------------------------------------
    def _changed(self, *_) -> None:
        if not self._filling and self.editing:
            self.dirty = True
            self.save_btn.set_sensitive(True)
            self.name.set_label(posixpath.basename(self.editing[1]) + " •")

    def save(self, then=None) -> None:
        if not self.editing or not self.dirty:
            if then:
                then()
            return
        (s, path), buf = self.editing, self.text.get_buffer()
        data = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), True).encode()

        def done(_r, err):
            if err:
                self.toast(f"Could not save: {err}")
                return
            self.dirty = False
            self.save_btn.set_sensitive(False)
            self.name.set_label(posixpath.basename(path))
            self.toast(f"Saved {posixpath.basename(path)}")
            if then:
                then()
        bg(lambda: remote_fs.write_bytes(s.ssh, path, data), done)

    def leave(self, then) -> None:
        """Run then() once unsaved edits are saved or dropped (asks first)."""
        if not self.dirty or not self.editing:
            then()
            return
        name = posixpath.basename(self.editing[1])
        d = Adw.AlertDialog(heading=f"Save changes to {name}?", body="Your edits are not saved on the cluster yet.")
        d.add_response("keep", "Keep editing")
        d.add_response("discard", "Discard")
        d.add_response("save", "Save")
        d.set_response_appearance("discard", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_response_appearance("save", Adw.ResponseAppearance.SUGGESTED)
        d.set_default_response("save")
        d.set_close_response("keep")

        def answer(_d, r):
            if r == "save":
                self.save(then)
            elif r == "discard":
                self.dirty = False
                then()
        d.connect("response", answer)
        d.present(self.get_root())

    def message(self, title: str, text: str = "", icon: str = "document-open-symbolic") -> None:
        self.token += 1
        self.editing, self.dirty = None, False
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
        self.editing, self.dirty = None, False
        self.set_visible_child_name("loading")

        bg(lambda: remote_fs.head_bytes(s.ssh, path, limit),
           lambda data, err: self._loaded(token, kind, e, data, err, s, path))

    def _loaded(self, token: int, kind: str, e: Entry, data: bytes, err: str, s: ClusterSession, path: str) -> None:
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
            self._filling = True
            buf.begin_irreversible_action()
            buf.set_text(data[:TEXT_LIMIT].decode("utf-8", "replace") + ("\n… (first 512 KB only)" if cut else ""))
            buf.end_irreversible_action()
            self._filling = False
            self.text.set_editable(not cut)  # only whole files can be saved back
            self.editing = None if cut else (s, path)
            self.dirty = False
            self.save_btn.set_sensitive(False)
            self.save_btn.set_visible(not cut)
            self.name.set_label(e.name + ("  (read only, too big to edit here)" if cut else ""))
            self.set_visible_child_name("text")
