"""LaTeX tab: edit on the cluster, build there, see the PDF, git history."""

import posixpath
import re
import shlex
import threading
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk, Pango

from .. import git, latex, projects, remote_fs
from ..config import LATEX_ENGINES
from ..latex import LatexIssue
from ..projects import Project, ProjectStore
from ..session import ClusterSession, State
from .editor import source_view
from .pdf import PdfView
from .widgets import remember_size

PROJECT_EXT = (".tex", ".bib", ".sty", ".cls", ".bst")


def _bg(work, done) -> None:
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


def _short(folder: str) -> str:
    """/mmfs1/scratch/mygroup/jdoe/MC/paper -> scratch/MC/paper; home becomes ~."""
    m = re.match(r"^(?:/mmfs1)?/(scratch|project)/[^/]+/[^/]+(/.*)?$", folder)
    if m:
        return m.group(1) + (m.group(2) or "")
    return re.sub(r"^(?:/mmfs1)?/home/[^/]+", "~", folder)


class LatexPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None],
                 save_config: Callable[[], None], store: ProjectStore | None = None,
                 on_new_project: Callable[[], None] = lambda: None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions = sessions
        self.store = store
        self.on_new_project = on_new_project
        self.toast = toast
        self.save_config = save_config
        self.session: ClusterSession | None = None
        self.main = ""
        self.folder = ""
        self.current = ""
        self.files: list[str] = []
        self.dirty = False
        self.building = False

        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(self._empty_page(), "empty")
        self.stack.add_named(self._project_page(), "project")
        self.append(self.stack)

    # -- layout ------------------------------------------------------------------------
    def _empty_page(self) -> Gtk.Widget:
        """Pick a project, like Overleaf's project list."""
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_top=18, margin_bottom=24,
                      margin_start=16, margin_end=16)
        top = Gtk.Box(spacing=8)
        top.append(Gtk.Label(label="LaTeX projects", xalign=0, hexpand=True, css_classes=["title-1"]))
        new = Gtk.Button(child=Adw.ButtonContent(label="New project", icon_name="list-add-symbolic"),
                         css_classes=["suggested-action"])
        new.connect("clicked", lambda *_: self.on_new_project())
        top.append(new)
        col.append(top)
        self.project_list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.project_list.set_placeholder(Gtk.Label(
            label="No papers yet. Pick one found below, or make a new LaTeX project.",
            wrap=True, margin_top=18, margin_bottom=18, margin_start=12, margin_end=12, css_classes=["dim-label"]))
        col.append(self.project_list)

        found = Gtk.Box(spacing=8, margin_top=12)
        found.append(Gtk.Label(label="Papers found on the cluster", xalign=0, hexpand=True, css_classes=["heading"]))
        self.scan_spin = Adw.Spinner(visible=False)
        self.scan_btn = Gtk.Button(child=Adw.ButtonContent(label="Search", icon_name="system-search-symbolic"),
                                   tooltip_text="Look for .tex files with \\documentclass in home, project and scratch")
        self.scan_btn.connect("clicked", lambda *_: self.scan(force=True))
        found.append(self.scan_spin)
        found.append(self.scan_btn)
        col.append(found)
        self.paper_list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.paper_note = Gtk.Label(xalign=0, wrap=True, css_classes=["dim-label", "caption"],
                                    label="Press Search to find your papers.")
        col.append(self.paper_note)
        col.append(self.paper_list)
        self.papers: dict[str, list[projects.Paper]] = {}  # cluster id -> found papers
        self.connect("map", lambda *_: self.scan())

        col.append(Gtk.Label(label="Or open a .tex file by path", xalign=0, css_classes=["heading"], margin_top=12))
        box = Gtk.Box(spacing=6)
        self.open_cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in self.sessions])
        self.open_path = Gtk.Entry(placeholder_text="~/paper/main.tex", hexpand=True)
        go = Gtk.Button(label="Open")
        go.connect("clicked", lambda *_: self.open(self.sessions[self.open_cluster.get_selected()],
                                                     self.open_path.get_text().strip()))
        self.open_path.connect("activate", lambda *_: go.emit("clicked"))
        for w in (self.open_cluster, self.open_path, go):
            box.append(w)
        col.append(box)
        if self.store:
            self.store.listeners.append(self._fill_projects)
            self._fill_projects()
        return Gtk.ScrolledWindow(child=Adw.Clamp(maximum_size=800, child=col))

    def _fill_projects(self) -> None:
        self.project_list.remove_all()
        by_id = {s.cfg.id: s for s in self.sessions}
        items = [p for p in self.store.recent() if p.is_latex]
        for p in items:
            s = by_id.get(p.cluster)
            if not s:
                continue
            sub = f"{s.cfg.name} · {p.path}" + (f" · {p.main_tex}" if p.main_tex else "")
            row = Adw.ActionRow(title=GLib.markup_escape_text(p.name), subtitle=GLib.markup_escape_text(sub),
                                activatable=True, subtitle_lines=1)
            row.add_prefix(Gtk.Image(icon_name="x-office-document-symbolic" if p.main_tex else "folder-symbolic"))
            row.add_suffix(Gtk.Image(icon_name="go-next-symbolic"))
            row.connect("activated", lambda _r, p=p, s=s: self.open_project(s, p))
            self.project_list.append(row)

    # -- papers found by searching the cluster ---------------------------------------------
    def scan(self, force: bool = False) -> None:
        live = [x for x in self.sessions if x.state == State.CONNECTED and x.ssh]
        if not live or self.scan_spin.get_visible():
            if not live:
                self.paper_note.set_label("Connect a cluster, then press Search to find your papers.")
            return
        todo = [x for x in live if force or x.cfg.id not in self.papers]
        self._fill_papers()
        if not todo:
            return
        self.scan_spin.set_visible(True)
        self.scan_btn.set_sensitive(False)
        self.paper_note.set_label("Searching home, project and scratch for .tex files… (takes a few seconds)")
        left = [len(todo)]
        for x in todo:
            def done(found, err, x=x):
                self.papers[x.cfg.id] = found or []
                left[0] -= 1
                if left[0] == 0:
                    self.scan_spin.set_visible(False)
                    self.scan_btn.set_sensitive(True)
                if err:
                    self.toast(f"{x.cfg.name}: search failed: {err}")
                self._fill_papers()
            _bg(lambda x=x: projects.find_papers(x.ssh), done)

    def _fill_papers(self) -> None:
        self.paper_list.remove_all()
        by_id = {x.cfg.id: x for x in self.sessions}
        rows = [(by_id[cid], p) for cid, found in self.papers.items() if cid in by_id for p in found]
        rows.sort(key=lambda r: -r[1].mtime)
        for x, p in rows[:40]:
            parent, name = posixpath.split(p.folder)
            title = f"{posixpath.basename(parent)} / {name}" if parent else name
            when = time.strftime("%b %d, %Y", time.localtime(p.mtime))
            more = f" (+{p.others} more)" if p.others else ""
            sub = f"{x.cfg.name} · {_short(p.folder)} · {p.main}{more} · {when}"
            row = Adw.ActionRow(title=GLib.markup_escape_text(title), subtitle=GLib.markup_escape_text(sub),
                                activatable=True, subtitle_lines=1, tooltip_text=f"{p.folder}/{p.main}")
            row.add_prefix(Gtk.Image(icon_name="x-office-document-symbolic"))
            row.add_suffix(Gtk.Image(icon_name="go-next-symbolic"))
            row.connect("activated", lambda _r, x=x, p=p: self._open_paper(x, p))
            self.paper_list.append(row)
        if self.papers and not self.scan_spin.get_visible():
            self.paper_note.set_label(f"{len(rows)} folders with a main .tex file, newest first. "
                                      "Click one to open it; it is also saved to your projects."
                                      if rows else "No .tex files with \\documentclass found.")
        self.paper_list.set_visible(bool(rows))

    def _open_paper(self, session: ClusterSession, paper: projects.Paper) -> None:
        p = self.store.find(session.cfg.id, paper.folder) if self.store else None
        if not p:
            p = Project(posixpath.basename(paper.folder), session.cfg.id, paper.folder, paper.main, kind="latex")
            if self.store:
                self.store.add(p)
        if self.store:
            self.store.touch(p)
        self.open_project(session, p)

    def open_project(self, session: ClusterSession, p: Project) -> None:
        """Open the project's main .tex (found once and remembered)."""
        if session.state != State.CONNECTED or not session.ssh:
            self.toast(f"Connect to {session.cfg.name} first")
            return
        if p.main_tex:
            self.open(session, posixpath.join(p.path, p.main_tex))
            return

        def done(found, err):
            if err or not found:
                self.toast(err or f"No .tex file with \\documentclass in {p.name}")
                return
            if len(found) == 1:
                self._set_main(session, p, found[0])
                return
            d = Adw.AlertDialog(heading=f"Main file for {p.name}", body="Which .tex file builds the PDF?")
            pick = Gtk.DropDown.new_from_strings(found)
            d.set_extra_child(pick)
            d.add_response("cancel", "Cancel")
            d.add_response("open", "Open")
            d.set_response_appearance("open", Adw.ResponseAppearance.SUGGESTED)
            d.connect("response", lambda _d, r: r == "open" and self._set_main(session, p, found[pick.get_selected()]))
            d.present(self.get_root())

        _bg(lambda: projects.find_main_tex(session.ssh, p.path), done)

    def _set_main(self, session: ClusterSession, p: Project, rel: str) -> None:
        p.main_tex = rel
        if self.store:
            self.store.changed()
        self.open(session, posixpath.join(p.path, rel))

    def _project_page(self) -> Gtk.Widget:
        page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        bar = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=8, margin_end=8)
        self.title = Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.START, css_classes=["heading"])
        self.file_pick = Gtk.DropDown.new_from_strings([])
        self.file_pick.set_tooltip_text("Project files")
        self.file_pick.connect("notify::selected", self._pick_file)
        self.save_btn = Gtk.Button(icon_name="document-save-symbolic", tooltip_text="Save (Ctrl+S)", sensitive=False)
        self.build_btn = Gtk.Button(child=Adw.ButtonContent(label="Build", icon_name="media-playback-start-symbolic"),
                                    css_classes=["suggested-action"], tooltip_text="Save and build (Ctrl+B)")
        self.spinner = Adw.Spinner(visible=False)
        self.auto = Gtk.ToggleButton(icon_name="emblem-synchronizing-symbolic", tooltip_text="Build on save")
        self.git_btn = Gtk.Button(child=Adw.ButtonContent(label="Git", icon_name="vcs-branch-symbolic"),
                                  tooltip_text="Git remote, history, commit")
        settings = Gtk.MenuButton(icon_name="emblem-system-symbolic", tooltip_text="Build settings",
                                  popover=self._settings_popover())
        close = Gtk.Button(icon_name="window-close-symbolic", tooltip_text="Close project", css_classes=["flat"])
        self.save_btn.connect("clicked", lambda *_: self.save())
        self.build_btn.connect("clicked", lambda *_: self.save(then=self.build))
        self.git_btn.connect("clicked", lambda *_: GitDialog(self.session, self.folder, self.toast).present(self.get_root()))
        close.connect("clicked", lambda *_: self._close())
        self.title.set_hexpand(True)
        for w in (self.title, self.file_pick, self.save_btn, self.auto, self.spinner, self.build_btn,
                  self.git_btn, settings, close):
            bar.append(w)
        page.append(bar)

        self.view = source_view("main.tex")
        self.buf = self.view.get_buffer()
        self.buf.connect("changed", self._changed)
        self.pdf = PdfView()
        paned = remember_size(Gtk.Paned(start_child=Gtk.ScrolledWindow(child=self.view), end_child=self.pdf,
                                        vexpand=True, wide_handle=True), "latex.editor", 620)
        page.append(paned)

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

        keys = Gtk.ShortcutController(scope=Gtk.ShortcutScope.MANAGED)
        for trigger, fn in (("<Control>s", lambda: self.save()), ("<Control>b", lambda: self.save(then=self.build))):
            keys.add_shortcut(Gtk.Shortcut(trigger=Gtk.ShortcutTrigger.parse_string(trigger),
                                           action=Gtk.CallbackAction.new(lambda *_, f=fn: f() or True)))
        page.add_controller(keys)
        return page

    def _settings_popover(self) -> Gtk.Popover:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin_top=8, margin_bottom=8,
                      margin_start=8, margin_end=8, width_request=320)
        self.setup_entry = Gtk.Entry(placeholder_text="Before build, e.g. module load TeXLive")
        self.engine = Gtk.DropDown.new_from_strings(["pdfLaTeX", "XeLaTeX", "LuaLaTeX"])
        self.on_node = Gtk.CheckButton(label="Build on my compute node (if I have one)")
        apply = Gtk.Button(label="Save settings")
        for w in (Gtk.Label(label="Build settings", xalign=0, css_classes=["heading"]), self.setup_entry,
                  self.engine, self.on_node, apply):
            box.append(w)
        pop = Gtk.Popover(child=box)
        pop.connect("show", lambda *_: self._load_settings())
        apply.connect("clicked", lambda *_: (self._store_settings(), pop.popdown()))
        return pop

    def _load_settings(self) -> None:
        if self.session:
            s = self.session.cfg.latex
            self.setup_entry.set_text(s.setup)
            self.engine.set_selected(LATEX_ENGINES.index(s.engine) if s.engine in LATEX_ENGINES else 0)
            self.on_node.set_active(s.on_node)

    def _store_settings(self) -> None:
        if self.session:
            s = self.session.cfg.latex
            s.setup, s.engine = self.setup_entry.get_text().strip(), LATEX_ENGINES[self.engine.get_selected()]
            s.on_node = self.on_node.get_active()
            self.save_config()
            self.toast("Build settings saved")

    # -- project -----------------------------------------------------------------------------
    def open(self, session: ClusterSession, path: str) -> None:
        if session.state != State.CONNECTED or not session.ssh:
            self.toast(f"Connect to {session.cfg.name} first")
            return
        if not path.endswith(".tex"):
            self.toast("Pick a .tex file")
            return

        def work():
            p = remote_fs.home(session.ssh) + path[1:] if path.startswith("~") else path
            folder = posixpath.dirname(p)
            find = (f"cd {shlex.quote(folder)} && find . -maxdepth 3 -type f \\( "
                    + " -o ".join(f"-name '*{e}'" for e in PROJECT_EXT) + " \\) | sed 's|^./||' | sort | head -300")
            files = session.ssh.run(find, timeout=60).stdout.split()
            return p, folder, files

        def done(result, err):
            if err:
                self.toast(err)
                return
            self.session, (self.main, self.folder, self.files) = session, result
            names = self.files or [posixpath.basename(self.main)]
            self.file_pick.set_model(Gtk.StringList.new(names))
            self.title.set_label(f"{session.cfg.name}: {self.main}")
            self.stack.set_visible_child_name("project")
            rel = posixpath.relpath(self.main, self.folder)
            self._load_file(self.main)
            if rel in names:
                self.file_pick.set_selected(names.index(rel))
            self._load_pdf()

        _bg(work, done)

    def _close(self) -> None:
        def go():
            self.session, self.main, self.current = None, "", ""
            self.stack.set_visible_child_name("empty")
        if self.dirty:
            self.save(then=go)
        else:
            go()

    def _pick_file(self, *_):
        item = self.file_pick.get_selected_item()
        if not item or not self.folder:
            return
        path = posixpath.join(self.folder, item.get_string())
        if path != self.current:
            if self.dirty:
                self.save(then=lambda: self._load_file(path))
            else:
                self._load_file(path)

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

        _bg(lambda: remote_fs.read_bytes(s.ssh, path, limit=8 * 1024 * 1024), done)

    def _jump(self, line: int) -> None:
        if line <= 0:
            self.buf.place_cursor(self.buf.get_start_iter())
            return
        ok, it = self.buf.get_iter_at_line(line - 1)
        if ok:
            self.buf.place_cursor(it)
            GLib.idle_add(lambda: self.view.scroll_to_iter(it, 0.2, True, 0, 0.3) and False)
            self.view.grab_focus()

    def _changed(self, *_):
        self.dirty = True
        self.save_btn.set_sensitive(True)

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

        _bg(lambda: remote_fs.write_bytes(s.ssh, path, text.encode()), done)

    # -- build -----------------------------------------------------------------------------
    def build(self) -> None:
        if self.building or not self.session:
            return
        s = self.session
        a = s.allocation
        self.building = True
        self.spinner.set_visible(True)
        self.build_btn.set_sensitive(False)

        def work():
            res = latex.build(s.ssh, self.main, s.cfg.latex, a.job_id if a else None)
            log = (res.stdout or "") + (res.stderr or "")
            pdf = None
            if res.returncode == 0:
                pdf = remote_fs.read_bytes(s.ssh, latex.pdf_path(self.main))
            return res.returncode, log, pdf

        def done(result, err):
            self.building = False
            self.spinner.set_visible(False)
            self.build_btn.set_sensitive(True)
            if err:
                self.toast(f"Build failed: {err}")
                return
            code, log, pdf = result
            self.log_view.get_buffer().set_text(log[-200000:])
            issues = latex.parse_issues(log)
            self._show_issues(issues)
            if pdf:
                self.pdf.load_bytes(pdf)
                self.toast("Built" + (f" with {len(issues)} warnings" if issues else ""))
            else:
                self.log_expander.set_expanded(True)
                self.toast(f"Build failed ({len(issues)} errors)" if issues else "Build failed, see log")

        _bg(work, done)

    def _load_pdf(self) -> None:
        s, main = self.session, self.main

        def done(data, err):
            if data:
                self.pdf.load_bytes(data, keep_position=False)
            else:
                self.pdf.show_message("No PDF yet", "Press Build.")
        _bg(lambda: remote_fs.read_bytes(s.ssh, latex.pdf_path(main)), done)

    def _show_issues(self, issues: list[LatexIssue]) -> None:
        while row := self.issues.get_row_at_index(0):
            self.issues.remove(row)
        for i in issues[:50]:
            row = Adw.ActionRow(title=GLib.markup_escape_text(i.message), subtitle=f"{i.file}:{i.line}",
                                activatable=True)
            row.issue = i
            row.add_prefix(Gtk.Image.new_from_icon_name("dialog-error-symbolic"))
            self.issues.append(row)
        self.issues.set_visible(bool(issues))

    def _goto(self, issue: LatexIssue) -> None:
        if posixpath.basename(self.current) == issue.file:
            self._jump(issue.line)
            return
        match = next((f for f in self.files if posixpath.basename(f) == issue.file), None)
        if match:
            self.save(then=lambda: self._load_file(posixpath.join(self.folder, match), issue.line))


class GitDialog(Adw.Dialog):
    def __init__(self, session: ClusterSession, folder: str, toast: Callable[[str], None]):
        super().__init__(title="Git", content_width=720, content_height=680)
        self.session, self.folder, self.app_toast = session, folder, toast
        self.page = Adw.PreferencesPage()
        self.toasts = Adw.ToastOverlay(child=self.page)
        tv = Adw.ToolbarView(content=self.toasts)
        header = Adw.HeaderBar()
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        refresh.connect("clicked", lambda *_: self.load())
        header.pack_start(refresh)
        tv.add_top_bar(header)
        self.set_child(tv)
        self.groups: list[Adw.PreferencesGroup] = []
        self.load()

    def _clear(self) -> None:
        for g in self.groups:
            self.page.remove(g)
        self.groups = []

    def _group(self, **kw) -> Adw.PreferencesGroup:
        g = Adw.PreferencesGroup(**kw)
        self.page.add(g)
        self.groups.append(g)
        return g

    def load(self) -> None:
        s = self.session
        _bg(lambda: git.info(s.ssh, self.folder), self._show)

    def _show(self, info: git.RepoInfo | None, err: str) -> None:
        self._clear()
        if err or not info:
            self._group(title="Git error", description=GLib.markup_escape_text(err))
            return
        if not info.root:
            self._group(title="Not a git repository", description=GLib.markup_escape_text(self.folder))
            return
        repo = self._group(title="Repository")
        repo.add(Adw.ActionRow(title="Folder", subtitle=GLib.markup_escape_text(info.root), subtitle_selectable=True,
                               css_classes=["property"]))
        repo.add(Adw.ActionRow(title="Branch", subtitle=info.branch or "(detached)", css_classes=["property"]))
        for name, url in info.remotes.items():
            row = Adw.ActionRow(title=f"Remote {name}", subtitle=GLib.markup_escape_text(url),
                                subtitle_selectable=True, css_classes=["property"])
            copy = Gtk.Button(icon_name="edit-copy-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                              tooltip_text="Copy address")
            copy.connect("clicked", lambda *_, u=url: (self.get_clipboard().set(u),
                                                       self.toasts.add_toast(Adw.Toast(title="Copied"))))
            row.add_suffix(copy)
            repo.add(row)
        if not info.remotes:
            repo.add(Adw.ActionRow(title="Remote", subtitle="none", css_classes=["property"]))

        work = self._group(title="Changes", description=f"{len(info.changes)} changed files" if info.changes
                           else "Nothing to commit")
        for line in info.changes[:30]:
            work.add(Adw.ActionRow(title=GLib.markup_escape_text(line[3:]), subtitle=line[:2].strip()))
        msg = Adw.EntryRow(title="Commit message")
        work.add(msg)
        buttons = Gtk.Box(spacing=6, halign=Gtk.Align.END, margin_top=8)
        for label, fn, cls in (("Pull", lambda: git.pull(self.session.ssh, self.folder), ""),
                               ("Commit", None, "suggested-action"),
                               ("Push", lambda: git.push(self.session.ssh, self.folder), "")):
            b = Gtk.Button(label=label, css_classes=[cls] if cls else [])
            if label == "Commit":
                b.set_sensitive(bool(info.changes))
                b.connect("clicked", lambda *_: self._run(
                    "Committed", lambda: git.commit_all(self.session.ssh, self.folder, msg.get_text().strip()))
                    if msg.get_text().strip() else self.toasts.add_toast(Adw.Toast(title="Write a message first")))
            else:
                b.connect("clicked", lambda *_, f=fn, l=label: self._run(f"{l} done", f))
            buttons.append(b)
        work.set_header_suffix(buttons)

        hist = self._group(title="History", description=f"Last {len(info.history)} commits")
        for c in info.history:
            row = Adw.ActionRow(title=GLib.markup_escape_text(c.subject),
                                subtitle=GLib.markup_escape_text(f"{c.hash} · {c.date} · {c.author}"),
                                activatable=True)
            row.connect("activated", lambda *_, h=c.hash, t=c.subject: self._show_commit(h, t))
            row.add_suffix(Gtk.Image.new_from_icon_name("go-next-symbolic"))
            hist.add(row)

    def _run(self, ok: str, fn) -> None:
        self.toasts.add_toast(Adw.Toast(title="Working…", timeout=2))

        def done(_r, err):
            self.toasts.add_toast(Adw.Toast(title=err.splitlines()[-1] if err else ok, timeout=5))
            self.load()
        _bg(fn, done)

    def _show_commit(self, commit: str, title: str) -> None:
        view = Gtk.TextView(editable=False, monospace=True, top_margin=8, left_margin=8)
        tv = Adw.ToolbarView(content=Gtk.ScrolledWindow(child=view, vexpand=True))
        tv.add_top_bar(Adw.HeaderBar())
        Adw.Dialog(title=f"{commit} · {title}", content_width=860, content_height=700, child=tv).present(self)
        _bg(lambda: git.show(self.session.ssh, self.folder, commit),
            lambda text, err: view.get_buffer().set_text(err or text))
