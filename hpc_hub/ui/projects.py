"""Projects tab: your named folders on the clusters. Open one in VS Code, Claude, Files or LaTeX."""

import posixpath
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass

from gi.repository import Adw, GLib, Gtk

from .. import projects, remote_fs
from ..projects import Project, ProjectStore
from ..session import ClusterSession, State
from .folder_picker import FolderPicker
from .widgets import vscode_button


@dataclass
class Actions:
    vscode: Callable[[ClusterSession, str, str], None]  # session, folder, target
    claude: Callable[[ClusterSession, str], None]
    files: Callable[[ClusterSession, str], None]
    latex: Callable[[ClusterSession, Project], None]
    connect: Callable[[ClusterSession], None]


def _bg(work, done) -> None:
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


def slug(name: str) -> str:
    return re.sub(r"[^\w.-]+", "-", name.strip()).strip("-") or "project"


class ProjectsPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], store: ProjectStore, toast: Callable[[str], None],
                 act: Actions):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions = {s.cfg.id: s for s in sessions}
        self.store, self.toast, self.act = store, toast, act
        self.after_connect: dict[str, Callable[[], None]] = {}

        top = Gtk.Box(spacing=8, margin_top=18, margin_bottom=12)
        top.append(Gtk.Label(label="Projects", xalign=0, hexpand=True, css_classes=["title-1"]))
        add = Gtk.Button(child=Adw.ButtonContent(label="Add folder", icon_name="folder-open-symbolic"),
                         tooltip_text="Use a folder that is already on a cluster")
        new = Gtk.Button(child=Adw.ButtonContent(label="New project", icon_name="list-add-symbolic"),
                         css_classes=["suggested-action"])
        add.connect("clicked", lambda *_: self.edit(None, create=False))
        new.connect("clicked", lambda *_: self.edit(None, create=True))
        top.append(add)
        top.append(new)
        self.search = Gtk.SearchEntry(placeholder_text="Search projects", margin_bottom=12)
        self.search.connect("search-changed", lambda *_: self.reload())
        self.list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])

        self.empty = Adw.StatusPage(icon_name="folder-symbolic", title="No projects yet", vexpand=True,
                                    description="Add a folder you already have on a cluster (myproject, MC, a paper…) "
                                                "or create a new one. Then open it in VS Code, Claude, Files or LaTeX.")
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, margin_start=16, margin_end=16, margin_bottom=24)
        col.append(top)
        col.append(self.search)
        col.append(self.list)
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=Adw.Clamp(maximum_size=900, child=col)), "list")
        empty_buttons = Gtk.Box(spacing=8, halign=Gtk.Align.CENTER)
        for label, create, css in (("Add folder", False, []), ("New project", True, ["suggested-action"])):
            b = Gtk.Button(label=label, css_classes=["pill", *css])
            b.connect("clicked", lambda *_, c=create: self.edit(None, create=c))
            empty_buttons.append(b)
        self.empty.set_child(empty_buttons)
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)

        store.listeners.append(self.reload)
        self.reload()

    # -- list ------------------------------------------------------------------------------
    def reload(self) -> None:
        self.list.remove_all()
        items = self.store.recent()
        self.stack.set_visible_child_name("list" if items else "empty")
        q = self.search.get_text().lower().split()
        for p in items:
            s = self.sessions.get(p.cluster)
            hay = f"{p.name} {p.path} {s.cfg.name if s else p.cluster}".lower()
            if all(w in hay for w in q):
                self.list.append(self._row(p, s))

    def _row(self, p: Project, s: ClusterSession | None) -> Adw.ActionRow:
        where = s.cfg.name if s else f"{p.cluster} (unknown cluster)"
        row = Adw.ActionRow(title=GLib.markup_escape_text(p.name), title_lines=1, subtitle_lines=1,
                            subtitle=GLib.markup_escape_text(f"{where} · {p.path}"))
        row.add_prefix(Gtk.Image(icon_name="x-office-document-symbolic" if p.main_tex else "folder-symbolic",
                                 pixel_size=24))
        if not s:
            return row
        box = Gtk.Box(spacing=4, valign=Gtk.Align.CENTER)
        box.append(vscode_button(lambda t: self.run(p, lambda: self.act.vscode(s, p.path, t)), label=""))
        for icon, tip, fn in (("user-available-symbolic", "Claude", lambda: self.act.claude(s, p.path)),
                              ("folder-symbolic", "Files", lambda: self.act.files(s, p.path)),
                              ("x-office-document-symbolic", "LaTeX", lambda: self.act.latex(s, p))):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip)
            b.connect("clicked", lambda *_, f=fn: self.run(p, f))
            box.append(b)
        more = Gtk.MenuButton(icon_name="view-more-symbolic", css_classes=["flat"], tooltip_text="More")
        menu = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=4, margin_bottom=4,
                       margin_start=4, margin_end=4)
        pop = Gtk.Popover(child=menu)
        for label, fn in (("Edit", lambda: self.edit(p, create=False)),
                          ("Copy path", lambda: (self.get_clipboard().set(p.path), self.toast("Path copied"))),
                          ("Remove from list", lambda: self.remove(p))):
            b = Gtk.Button(label=label, css_classes=["flat"])
            b.get_child().set_xalign(0)
            b.connect("clicked", lambda *_, f=fn: (pop.popdown(), f()))
            menu.append(b)
        more.set_popover(pop)
        box.append(more)
        row.add_suffix(box)
        return row

    def remove(self, p: Project) -> None:
        d = Adw.AlertDialog(heading=f"Remove {p.name}?", body="Only from this list. The folder on the cluster stays.")
        d.add_response("cancel", "Cancel")
        d.add_response("remove", "Remove")
        d.set_response_appearance("remove", Adw.ResponseAppearance.DESTRUCTIVE)
        d.connect("response", lambda _d, r: r == "remove" and self.store.remove(p))
        d.present(self.get_root())

    # -- actions ----------------------------------------------------------------------------
    def run(self, p: Project, fn: Callable[[], None]) -> None:
        """Run fn for the project, connecting its cluster first if needed."""
        s = self.sessions[p.cluster]

        def go():
            if p.path.startswith("~"):
                def resolve():
                    return remote_fs.home(s.ssh) + p.path[1:]

                def done(path, err):
                    if err:
                        self.toast(err)
                        return
                    p.path = path
                    self.store.changed()
                    go()
                _bg(resolve, done)
                return
            self.store.touch(p)
            fn()

        if s.state == State.CONNECTED and s.ssh:
            go()
        elif s.state.busy:
            self.after_connect[s.cfg.id] = go
            self.toast(f"Waiting for {s.cfg.name} to connect…")
        else:
            self.after_connect[s.cfg.id] = go
            self.toast(f"Connecting to {s.cfg.name} first…")
            self.act.connect(s)

    def session_changed(self, s: ClusterSession) -> None:
        fn = self.after_connect.get(s.cfg.id)
        if not fn:
            return
        if s.state == State.CONNECTED and s.ssh:
            del self.after_connect[s.cfg.id]
            fn()
        elif s.state in (State.ERROR, State.DISCONNECTED):
            del self.after_connect[s.cfg.id]

    def edit(self, p: Project | None, create: bool) -> None:
        ProjectDialog(list(self.sessions.values()), self.store, p, create, self.toast).present(self.get_root())


class ProjectDialog(Adw.Dialog):
    """Add an existing folder, create a new project, or edit one."""

    def __init__(self, sessions: list[ClusterSession], store: ProjectStore, p: Project | None, create: bool,
                 toast: Callable[[str], None]):
        title = "New project" if create else ("Edit project" if p else "Add folder as project")
        super().__init__(title=title, content_width=560)
        self.sessions, self.store, self.p, self.create, self.toast = sessions, store, p, create, toast
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup()
        self.name = Adw.EntryRow(title="Name (e.g. myproject, MC)")
        self.cluster = Adw.ComboRow(title="Cluster", model=Gtk.StringList.new([s.cfg.name for s in sessions]))
        self.folder = Adw.EntryRow(title="Create inside folder" if create else "Folder on the cluster")
        browse = Gtk.Button(icon_name="folder-open-symbolic", tooltip_text="Browse", valign=Gtk.Align.CENTER,
                            css_classes=["flat"])
        browse.connect("clicked", lambda *_: self._browse())
        self.folder.add_suffix(browse)
        for row in (self.name, self.cluster, self.folder):
            group.add(row)
        page.add(group)

        self.template = Adw.ComboRow(title="Start with", model=Gtk.StringList.new(projects.TEMPLATES))
        self.git = Adw.SwitchRow(title="Make it a git repository", active=True)
        self.result = Adw.ActionRow(title="Will create", css_classes=["property"], subtitle_selectable=True)
        if create:
            extra = Adw.PreferencesGroup()
            for row in (self.template, self.git, self.result):
                extra.add(row)
            page.add(extra)
            self.folder.set_text("~")
        if p:
            self.name.set_text(p.name)
            self.folder.set_text(p.path)
            ids = [s.cfg.id for s in sessions]
            self.cluster.set_selected(ids.index(p.cluster) if p.cluster in ids else 0)
        for w in (self.name, self.folder):
            w.connect("changed", lambda *_: self._sync())

        self.error = Gtk.Label(wrap=True, visible=False, css_classes=["error"], margin_start=12, margin_end=12)
        self.save_btn = Gtk.Button(label="Create" if create else "Save", css_classes=["suggested-action", "pill"],
                                   halign=Gtk.Align.CENTER, margin_top=6, margin_bottom=18)
        self.save_btn.connect("clicked", lambda *_: self._save())
        self.spinner = Adw.Spinner(visible=False, halign=Gtk.Align.CENTER)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(page)
        box.append(self.error)
        box.append(self.spinner)
        box.append(self.save_btn)
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self._sync()

    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def _target(self) -> str:
        base = self.folder.get_text().strip() or "~"
        return posixpath.join(base, slug(self.name.get_text())) if self.create else base

    def _sync(self) -> None:
        self.result.set_subtitle(GLib.markup_escape_text(self._target()))

    def _fail(self, msg: str) -> None:
        self.error.set_label(msg)
        self.error.set_visible(bool(msg))
        self.spinner.set_visible(False)
        self.save_btn.set_sensitive(True)

    def _browse(self) -> None:
        s = self.session
        if s.state != State.CONNECTED or not s.ssh:
            self._fail(f"Connect to {s.cfg.name} to browse its folders")
            return
        FolderPicker(s, self.folder.get_text().strip() or "~", self.folder.set_text).present(self)

    def _save(self) -> None:
        name, s = self.name.get_text().strip(), self.session
        path = self._target()
        if not name:
            self._fail("Give the project a name")
            return
        if not path.startswith(("/", "~")):
            self._fail("Folder must start with / or ~")
            return
        connected = s.state == State.CONNECTED and s.ssh
        if not connected:
            if self.create:
                self._fail(f"Connect to {s.cfg.name} first to create the folder")
                return
            self._store(Project(name, s.cfg.id, path))  # checked the first time you open it
            return
        template = projects.TEMPLATES[self.template.get_selected()]
        git_init = self.git.get_active()

        def work():
            target = remote_fs.home(s.ssh) + path[1:] if path.startswith("~") else path
            if self.create:
                res = s.ssh.run(projects.create_command(target, template, name, git_init), timeout=60)
                if res.returncode != 0:
                    raise RuntimeError(res.stderr.strip() or "Could not create the folder (does it exist already?)")
            elif s.ssh.run(f"test -d {remote_fs.q(target)}", timeout=30).returncode != 0:
                raise RuntimeError(f"No folder {target} on {s.cfg.name}")
            mains = projects.find_main_tex(s.ssh, target)
            return Project(name, s.cfg.id, target, main_tex=mains[0] if mains else "")

        def done(project, err):
            if err:
                self._fail(err)
                return
            self._store(project)

        self._fail("")
        self.spinner.set_visible(True)
        self.save_btn.set_sensitive(False)
        _bg(work, done)

    def _store(self, project: Project) -> None:
        if self.p:
            self.p.name, self.p.cluster, self.p.path = project.name, project.cluster, project.path
            self.p.main_tex = project.main_tex or (self.p.main_tex if project.path == self.p.path else "")
            self.store.changed()
        else:
            self.store.add(project)
        self.toast(f"{'Created' if self.create else 'Saved'} {project.name}")
        self.close()
