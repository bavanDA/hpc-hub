"""Project picker: your LaTeX projects, papers found on the cluster, or a .tex path."""

import posixpath
import re
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ...connect.session import ClusterSession
from ...projects import store as projects
from ...projects.store import Project, ProjectStore
from ...ui.widgets import bg


def _short(folder: str) -> str:
    """/mmfs1/scratch/mygroup/jdoe/MC/paper -> scratch/MC/paper; home becomes ~."""
    m = re.match(r"^(?:/mmfs1)?/(scratch|project)/[^/]+/[^/]+(/.*)?$", folder)
    if m:
        return m.group(1) + (m.group(2) or "")
    return re.sub(r"^(?:/mmfs1)?/home/[^/]+", "~", folder)


class ProjectPicker(Gtk.ScrolledWindow):
    """Pick a project, like Overleaf's project list. open_tex(session, path) opens the editor."""

    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None],
                 open_tex: Callable[[ClusterSession, str], None], store: ProjectStore | None = None,
                 on_new_project: Callable[[], None] = lambda: None):
        super().__init__()
        self.sessions = sessions
        self.toast = toast
        self.open_tex = open_tex
        self.store = store
        self.on_new_project = on_new_project
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
        self.found_at: dict[str, int] = {}  # cluster id -> when it was last searched
        for x in self.sessions:  # the last search's results; Search looks again
            found, at = projects.load_papers(x.cfg.id)
            if at:
                self.papers[x.cfg.id], self.found_at[x.cfg.id] = found, at
        col.append(Gtk.Label(label="Or open a .tex file by path", xalign=0, css_classes=["heading"], margin_top=12))
        box = Gtk.Box(spacing=6)
        self.open_cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in self.sessions])
        self.open_path = Gtk.Entry(placeholder_text="~/paper/main.tex", hexpand=True)
        go = Gtk.Button(label="Open")
        go.connect("clicked", lambda *_: self.open_tex(self.sessions[self.open_cluster.get_selected()],
                                                         self.open_path.get_text().strip()))
        self.open_path.connect("activate", lambda *_: go.emit("clicked"))
        for w in (self.open_cluster, self.open_path, go):
            box.append(w)
        col.append(box)
        if self.store:
            self.store.listeners.append(self._fill_projects)
            self._fill_projects()
        self.set_child(Adw.Clamp(maximum_size=800, child=col))

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
        live = [x for x in self.sessions if x.connected]
        if not live or self.scan_spin.get_visible():
            self._fill_papers()  # saved results show even before you connect
            if not live and not self.papers:
                self.paper_note.set_label("Connect a cluster, then press Search to find your papers.")
            return
        todo = [x for x in live if force or x.cfg.id not in self.papers]  # cached ones wait for Search
        self._fill_papers()
        if not todo:
            return
        self.scan_spin.set_visible(True)
        self.scan_btn.set_sensitive(False)
        self.paper_note.set_label("Searching home, project and scratch for .tex files… (takes a few seconds)")
        left = [len(todo)]
        for x in todo:
            def done(found, err, x=x):
                if not err:
                    self.papers[x.cfg.id] = found or []
                    self.found_at[x.cfg.id] = int(time.time())
                    projects.save_papers(x.cfg.id, found or [])
                left[0] -= 1
                if left[0] == 0:
                    self.scan_spin.set_visible(False)
                    self.scan_btn.set_sensitive(True)
                if err:
                    self.toast(f"{x.cfg.name}: search failed: {err}")
                self._fill_papers()
            bg(lambda x=x: projects.find_papers(x.ssh), done)

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
            oldest = min(self.found_at.values(), default=0)
            ago = f"Found {time.strftime('%b %d %H:%M', time.localtime(oldest))}; press Search to look again. " \
                if oldest else ""
            self.paper_note.set_label(f"{len(rows)} folders with a main .tex file, newest first. {ago}"
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
        if not session.connected:
            self.toast(f"Connect to {session.cfg.name} first")
            return
        if p.main_tex:
            self.open_tex(session, posixpath.join(p.path, p.main_tex))
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

        bg(lambda: projects.find_main_tex(session.ssh, p.path), done)

    def _set_main(self, session: ClusterSession, p: Project, rel: str) -> None:
        p.main_tex = rel
        if self.store:
            self.store.changed()
        self.open_tex(session, posixpath.join(p.path, rel))
