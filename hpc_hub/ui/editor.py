"""Edit a text file that lives on a cluster (GtkSourceView)."""

import posixpath

import gi

gi.require_version("GtkSource", "5")
from gi.repository import Adw, Gtk, GtkSource  # noqa: E402

from .. import remote_fs  # noqa: E402
from ..connect.session import ClusterSession  # noqa: E402
from .widgets import bg  # noqa: E402


def source_view(filename: str) -> GtkSource.View:
    buf = GtkSource.Buffer()
    lang = GtkSource.LanguageManager.get_default().guess_language(filename, None)
    if lang:
        buf.set_language(lang)
    schemes = GtkSource.StyleSchemeManager.get_default()

    def theme(*_):
        dark = Adw.StyleManager.get_default().get_dark()
        buf.set_style_scheme(schemes.get_scheme("Adwaita-dark" if dark else "Adwaita"))

    Adw.StyleManager.get_default().connect("notify::dark", theme)
    theme()
    view = GtkSource.View(buffer=buf, monospace=True, show_line_numbers=True, highlight_current_line=True,
                          auto_indent=True, tab_width=2, insert_spaces_instead_of_tabs=True,
                          wrap_mode=Gtk.WrapMode.WORD_CHAR, vexpand=True, hexpand=True,
                          top_margin=8, bottom_margin=8, left_margin=6)
    return view


class EditorDialog(Adw.Dialog):
    def __init__(self, session: ClusterSession, path: str, template: str = ""):
        super().__init__(title=posixpath.basename(path), content_width=860, content_height=680)
        self.session = session
        self.path = path
        self.template = template
        self.dirty = False

        self.view = source_view(path)
        self.buf = self.view.get_buffer()
        self.save_btn = Gtk.Button(label="Save", css_classes=["suggested-action"], sensitive=False)
        self.save_btn.connect("clicked", lambda *_: self.save())
        header = Adw.HeaderBar(title_widget=Adw.WindowTitle(title=posixpath.basename(path),
                                                             subtitle=f"{session.cfg.name}: {path}"))
        header.pack_start(self.save_btn)
        self.toasts = Adw.ToastOverlay(child=Gtk.ScrolledWindow(child=self.view))
        toolbar = Adw.ToolbarView(content=self.toasts)
        toolbar.add_top_bar(header)
        self.set_child(toolbar)

        keys = Gtk.ShortcutController()
        keys.add_shortcut(Gtk.Shortcut(trigger=Gtk.ShortcutTrigger.parse_string("<Control>s"),
                                       action=Gtk.CallbackAction.new(lambda *_: self.save() or True)))
        self.add_controller(keys)
        self.set_can_close(False)
        self.connect("close-attempt", self._close_attempt)
        self.buf.connect("changed", self._changed)
        self.view.set_sensitive(False)
        self._load()

    def _load(self) -> None:
        s = self.session

        def work():
            self.path = remote_fs.expand(s.ssh, self.path)
            try:
                return remote_fs.read_bytes(s.ssh, self.path, limit=8 * 1024 * 1024).decode("utf-8", "replace")
            except remote_fs.FsError:
                if not self.template:
                    raise
                return self.template

        bg(work, self._loaded)

    def _loaded(self, text: str | None, err: str) -> None:
        if err:
            self.toasts.add_toast(Adw.Toast(title=err, timeout=6))
            return
        self.buf.begin_irreversible_action()
        self.buf.set_text(text)
        self.buf.end_irreversible_action()
        self.buf.place_cursor(self.buf.get_start_iter())
        self.dirty = False
        self.save_btn.set_sensitive(False)
        self.view.set_sensitive(True)
        self.view.grab_focus()

    def _changed(self, *_):
        self.dirty = True
        self.save_btn.set_sensitive(True)

    def save(self, then=None) -> None:
        text = self.buf.get_text(self.buf.get_start_iter(), self.buf.get_end_iter(), True)
        self.save_btn.set_sensitive(False)
        s = self.session

        def work():
            remote_fs.mkdir(s.ssh, posixpath.dirname(self.path) or "/")
            remote_fs.write_bytes(s.ssh, self.path, text.encode())

        bg(work, lambda _r, err: self._saved(err, then))

    def _saved(self, err: str, then) -> None:
        if err:
            self.save_btn.set_sensitive(True)
            self.toasts.add_toast(Adw.Toast(title=f"Save failed: {err}", timeout=6))
            return
        self.dirty = False
        self.toasts.add_toast(Adw.Toast(title="Saved", timeout=2))
        if then:
            then()

    def _close_attempt(self, *_):
        if not self.dirty:
            self.force_close()
            return
        d = Adw.AlertDialog(heading="Save changes?", body=f"{posixpath.basename(self.path)} has unsaved changes.")
        d.add_response("discard", "Discard")
        d.add_response("cancel", "Cancel")
        d.add_response("save", "Save")
        d.set_response_appearance("discard", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_response_appearance("save", Adw.ResponseAppearance.SUGGESTED)

        def on_response(_d, r):
            if r == "discard":
                self.force_close()
            elif r == "save":
                self.save(then=self.force_close)

        d.connect("response", on_response)
        d.present(self)
