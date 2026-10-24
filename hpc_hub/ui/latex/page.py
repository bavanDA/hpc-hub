"""LatexPage: the project picker, or the editor with its PDF, files, build log and git."""

import posixpath
from collections.abc import Callable

from gi.repository import Adw, GLib, GObject, Gtk, Pango

from ... import latex, synctex
from ...files import remote_fs
from ...projects import Project, ProjectStore
from ...connect.session import ClusterSession
from ...files.ui.editor import source_view
from ..pdf_pane import PdfPane
from ..widgets import bg, remember, remembered, remember_size, shortcuts
from .build import BuildMixin
from .file_tree import FileTree, list_tree
from .files_pane import FilesMixin
from .git_menu import GitMixin
from .picker import ProjectPicker
from .sync import SyncMixin


VIEWS = ["editor", "split", "pdf"]


class LatexPage(FilesMixin, SyncMixin, GitMixin, BuildMixin, Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None],
                 save_config: Callable[[], None], store: ProjectStore | None = None,
                 on_new_project: Callable[[], None] = lambda: None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.toast = toast
        self.save_config = save_config
        self.store = store
        self.session: ClusterSession | None = None
        self.main = ""
        self.folder = ""
        self.current = ""
        self.files: list[str] = []
        self.dirty = False
        self.building = False

        self.stack = Gtk.Stack(vexpand=True)
        self.picker = ProjectPicker(sessions, toast, self.open, store, on_new_project)
        self.connect("map", lambda *_: self.picker.scan())
        self.stack.add_named(self.picker, "empty")
        self.stack.add_named(self._project_page(), "project")
        self.append(self.stack)

    def _layout(self) -> None:
        view = self.layout.get_active_name() or "split"
        self.editor_box.set_visible(view != "pdf")
        self.pdf.set_visible(view != "editor")
        remember("latex.view", VIEWS.index(view))

    def open_project(self, session: ClusterSession, p: Project) -> None:
        self.picker.open_project(session, p)

    # -- layout ------------------------------------------------------------------------
    def _project_page(self) -> Gtk.Widget:
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        bar = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=8, margin_end=8)
        self.title = Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.START, css_classes=["heading"])
        self.files_btn = Gtk.ToggleButton(icon_name="sidebar-show-symbolic", active=True,
                                          tooltip_text="Show or hide project files")
        self.layout = Adw.ToggleGroup(css_classes=["round"], tooltip_text="Editor, both side by side, or PDF")
        for name, icon, tip in (("editor", "text-editor-symbolic", "Editor only"),
                                ("split", "view-dual-symbolic", "Editor and PDF"),
                                ("pdf", "x-office-document-symbolic", "PDF only")):
            self.layout.add(Adw.Toggle(name=name, icon_name=icon, tooltip=tip))
        self.to_pdf = Gtk.Button(icon_name="go-next-symbolic", tooltip_text="Show this line in the PDF (Ctrl+J)")
        self.to_pdf.connect("clicked", lambda *_: self.show_in_pdf())
        self.save_btn = Gtk.Button(icon_name="document-save-symbolic", tooltip_text="Save (Ctrl+S)", sensitive=False)
        self.build_btn = Gtk.Button(child=Adw.ButtonContent(label="Build", icon_name="media-playback-start-symbolic"),
                                    css_classes=["suggested-action"], tooltip_text="Save and build (Ctrl+B)")
        self.spinner = Adw.Spinner(visible=False)
        self.auto = Gtk.ToggleButton(icon_name="emblem-synchronizing-symbolic", tooltip_text="Build on save")
        self.git_btn = Gtk.MenuButton(child=Adw.ButtonContent(label="Git", icon_name="vcs-branch-symbolic"),
                                      tooltip_text="Pull, push, commit, history", popover=self._git_popover())
        settings = Gtk.MenuButton(icon_name="emblem-system-symbolic", tooltip_text="Build settings",
                                  popover=self._settings_popover())
        close = Gtk.Button(icon_name="window-close-symbolic", tooltip_text="Close project", css_classes=["flat"])
        self.save_btn.connect("clicked", lambda *_: self.save())
        self.build_btn.connect("clicked", lambda *_: self.save(then=self.build))
        close.connect("clicked", lambda *_: self._close())
        self.title.set_hexpand(True)
        for w in (self.files_btn, self.title, self.layout, self.save_btn, self.auto, self.spinner, self.build_btn,
                  self.to_pdf, self.git_btn, settings, close):
            bar.append(w)
        page.append(bar)

        self.view = source_view("main.tex")
        self.buf = self.view.get_buffer()
        self.buf.connect("changed", self._changed)
        self.pdf = PdfPane(self.toast)
        self.pdf.on_double_click = self.show_in_source
        self.sync: synctex.SyncTex | None = None
        self.editor_box = Gtk.ScrolledWindow(child=self.view)
        paned = remember_size(Gtk.Paned(start_child=self.editor_box, end_child=self.pdf,
                                        vexpand=True, wide_handle=True), "latex.editor", 620)
        self.layout.connect("notify::active-name", lambda *_: self._layout())
        self.layout.set_active_name(VIEWS[remembered("latex.view", 1) % len(VIEWS)])
        self.tree = side = FileTree(self, self._open_listed)
        self.files_btn.bind_property("active", side, "visible", GObject.BindingFlags.SYNC_CREATE)
        outer = remember_size(Gtk.Paned(start_child=side, end_child=paned, vexpand=True, shrink_start_child=False,
                                        resize_start_child=False), "latex.files", 200)
        page.append(outer)
        self._drop_target(self.view, into_editor=True)

        self.issues = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.issues.connect("row-activated", lambda _l, row: self._goto(row.issue))
        self.log_view = Gtk.TextView(editable=False, monospace=True, wrap_mode=Gtk.WrapMode.CHAR,
                                     css_classes=["log-view"])
        log_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin_start=8, margin_end=8,
                          margin_bottom=8)
        log_box.append(self.issues)
        log_box.append(Gtk.ScrolledWindow(child=self.log_view, min_content_height=140))
        self.log_expander = Gtk.Expander(label="Build log", child=log_box, margin_start=8)
        page.append(self.log_expander)

        shortcuts(page, ("<Control>s", self.save), ("<Control>b", lambda: self.save(then=self.build)),
                  ("<Control>j", self.show_in_pdf))
        return page

    # -- project -----------------------------------------------------------------------------
    def open(self, session: ClusterSession, path: str) -> None:
        if not session.connected:
            self.toast(f"Connect to {session.cfg.name} first")
            return
        if not path.endswith(".tex"):
            self.toast("Pick a .tex file")
            return

        def work():
            p = remote_fs.expand(session.ssh, path)
            folder = posixpath.dirname(p)
            return p, folder, list_tree(session.ssh, folder)

        def done(result, err):
            if err:
                self.toast(err)
                return
            self.session, (self.main, self.folder, entries) = session, result
            self.tree.show(entries)
            self.sync = None
            self.pdf.set_filename(latex.pdf_path(posixpath.basename(self.main)))
            self.title.set_label(f"{session.cfg.name}: {self.main}")
            self.stack.set_visible_child_name("project")
            self._load_file(self.main)
            self._load_pdf()
            self._load_sync()

        bg(work, done)

    def _close(self) -> None:
        def go():
            self.session, self.main, self.current = None, "", ""
            self.stack.set_visible_child_name("empty")
        if self.dirty:
            self.save(then=go)
        else:
            go()

    # -- editor ----------------------------------------------------------------------------
    def _load_file(self, path: str, line: int = 0) -> None:
        s = self.session

        def done(data, err):
            if err:
                self.toast(err)
                return
            self.current = path
            lang = source_view(path).get_buffer().get_language()
            self.buf.set_language(lang)
            self.buf.begin_irreversible_action()
            self.buf.set_text(data.decode("utf-8", "replace"))
            self.buf.end_irreversible_action()
            self.dirty = False
            self.save_btn.set_sensitive(False)
            self._jump(line)
            self._fill_files()

        bg(lambda: remote_fs.read_bytes(s.ssh, path, limit=8 * 1024 * 1024), done)

    def _jump(self, line: int) -> None:
        if line <= 0:
            self.buf.place_cursor(self.buf.get_start_iter())
            return
        ok, it = self.buf.get_iter_at_line(line - 1)
        if ok:
            self.buf.place_cursor(it)
            GLib.idle_add(lambda: self.view.scroll_to_iter(it, 0.2, True, 0, 0.3) and False)
            self.view.grab_focus()

    def _switch_to(self, path: str, line: int = 0) -> None:
        """Open another file, saving this one first if it changed."""
        if self.dirty:
            self.save(then=lambda: self._load_file(path, line))
        else:
            self._load_file(path, line)

    def _changed(self, *_):
        self.dirty = True
        self.save_btn.set_sensitive(True)

    def _cursor_line(self) -> int:
        return self.buf.get_iter_at_mark(self.buf.get_insert()).get_line() + 1

    def save(self, then: Callable[[], None] | None = None) -> None:
        if not self.session or not self.current:
            return
        if not self.dirty:
            if then:
                then()
            return
        s, path = self.session, self.current
        text = self.buf.get_text(self.buf.get_start_iter(), self.buf.get_end_iter(), True)
        self.save_btn.set_sensitive(False)

        def done(_r, err):
            if err:
                self.save_btn.set_sensitive(True)
                self.toast(f"Save failed: {err}")
                return
            self.dirty = False
            if then:
                then()
            elif self.auto.get_active():
                self.build()

        bg(lambda: remote_fs.write_bytes(s.ssh, path, text.encode()), done)
