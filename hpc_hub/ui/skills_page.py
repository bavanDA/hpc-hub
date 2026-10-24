"""Skills page: what Claude and ChatGPT know on each cluster, and adding more from a git repository."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import skills
from ..connect.session import ClusterSession
from ..skills import TARGETS, Skill
from .widgets import bg


def _row(sk: Skill) -> Adw.ActionRow:
    return Adw.ActionRow(title=GLib.markup_escape_text(sk.name), subtitle=GLib.markup_escape_text(sk.description),
                         subtitle_lines=2, tooltip_text=sk.path)


class SkillsPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions, self.toast = sessions, toast

        bar = Gtk.Box(spacing=8, margin_top=12, margin_bottom=6, margin_start=12, margin_end=12)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        add = Gtk.Button(child=Adw.ButtonContent(label="Add skills", icon_name="list-add-symbolic"),
                         css_classes=["suggested-action"])
        add.connect("clicked", lambda *_: self.add())
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        refresh.connect("clicked", lambda *_: self.refresh())
        for w in (self.cluster, Gtk.Box(hexpand=True), add, refresh):
            bar.append(w)
        self.append(bar)

        self.page = Adw.PreferencesPage()
        self.groups: list[Adw.PreferencesGroup] = []
        self.append(self.page)
        self.cluster.connect("notify::selected", lambda *_: self.refresh())
        self.connect("map", lambda *_: self.refresh())

    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def _clear(self) -> None:
        for g in self.groups:
            self.page.remove(g)
        self.groups = []

    def _group(self, **kw) -> Adw.PreferencesGroup:
        g = Adw.PreferencesGroup(**kw)
        self.page.add(g)
        self.groups.append(g)
        return g

    def refresh(self) -> None:
        s = self.session
        self._clear()
        if not s.connected:
            self._group(description=f"Connect to {s.cfg.name} to see its skills.")
            return
        loading = self._group(description="Loading…")
        bg(lambda: skills.installed(s.ssh), lambda got, err: self._show(s, got or [], err, loading))

    def _show(self, s: ClusterSession, got: list[Skill], err: str, loading) -> None:
        if s is not self.session:
            return
        self._clear()
        if err:
            self._group(description=f"Could not read skills: {err}")
            return
        self._catalog(s, got)
        for target, (label, rel) in TARGETS.items():
            mine = [k for k in got if k.target == target and not k.managed]
            built_in = [k for k in got if k.target == target and k.managed]
            g = self._group(title=f"{label} skills", description=f"~/{rel} on {s.cfg.name}")
            for sk in mine:
                row = _row(sk)
                rm = Gtk.Button(icon_name="user-trash-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER,
                                tooltip_text="Remove")
                rm.connect("clicked", lambda *_, k=sk: self._remove(s, k))
                row.add_suffix(rm)
                g.add(row)
            if not mine:
                g.add(Adw.ActionRow(title="None added yet", subtitle="Press Add skills."))
            if built_in:
                more = Adw.ExpanderRow(title=f"Built in or synced ({len(built_in)})",
                                       subtitle=f"Managed by {label} itself")
                for sk in built_in:
                    more.add_row(_row(sk))
                g.add(more)

    def _catalog(self, s: ClusterSession, installed: list[Skill]) -> None:
        """HPC Hub's own skills: add any of them to the agents you use."""
        g = self._group(title="HPC Hub skills", description="Ready to use. Add them to your favourite agents.")
        have: dict[str, set[str]] = {}
        for k in installed:
            have.setdefault(k.folder, set()).add(k.target)
        for sk in skills.catalog():
            name = sk.path.rstrip("/").rsplit("/", 1)[-1]
            row = _row(sk)
            on = [TARGETS[t][0] for t in TARGETS if t in have.get(name, set())]
            if on:
                row.set_subtitle(GLib.markup_escape_text(f"In {', '.join(on)} · {sk.description}"))
            row.add_suffix(self._add_button(s, sk, have.get(name, set())))
            g.add(row)

    def _add_button(self, s: ClusterSession, sk: Skill, has: set[str]) -> Gtk.MenuButton:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4, margin_top=8, margin_bottom=8,
                      margin_start=8, margin_end=8)
        checks = {}
        for t, (label, _) in TARGETS.items():
            checks[t] = Gtk.CheckButton(label=label, active=t not in has)
            box.append(checks[t])
        go = Gtk.Button(label="Add", css_classes=["suggested-action"], margin_top=4)
        box.append(go)
        pop = Gtk.Popover(child=box)
        go.connect("clicked", lambda *_: (pop.popdown(),
                                          self._install(s, sk, [t for t, c in checks.items() if c.get_active()])))
        return Gtk.MenuButton(label="Add to…", popover=pop, valign=Gtk.Align.CENTER, css_classes=["flat"])

    def _install(self, s: ClusterSession, sk: Skill, targets: list[str]) -> None:
        if not targets:
            return
        names = ", ".join(TARGETS[t][0] for t in targets)
        bg(lambda: skills.install_local(s.ssh, [sk], targets),
           lambda _r, err: (self.toast(f"Could not add {sk.name}: {err}" if err else f"Added {sk.name} to {names}"),
                            self.refresh()))

    def _remove(self, s: ClusterSession, sk: Skill) -> None:
        bg(lambda: s.ssh.run(skills.remove_command(sk), timeout=30),
           lambda _r, err: (self.toast(f"Failed: {err}" if err else f"Removed {sk.name}"), self.refresh()))

    def add(self) -> None:
        s = self.session
        if not s.connected:
            self.toast(f"Connect to {s.cfg.name} first")
            return
        AddSkillsDialog(s, self.toast, self.refresh).present(self.get_root())


class AddSkillsDialog(Adw.Dialog):
    def __init__(self, s: ClusterSession, toast: Callable[[str], None], on_done: Callable[[], None]):
        super().__init__(title=f"Add skills on {s.cfg.name}", content_width=640, content_height=760)
        self.s, self.toast, self.on_done = s, toast, on_done
        self.found: list[tuple[Skill, Gtk.CheckButton]] = []
        page = Adw.PreferencesPage()

        src = Adw.PreferencesGroup(description="A git repository with SKILL.md folders. It is cloned on the cluster.")
        self.url = Adw.EntryRow(title="Repository", text=skills.DEFAULT_REPO)
        load = Gtk.Button(label="Load", valign=Gtk.Align.CENTER)
        load.connect("clicked", lambda *_: self._load())
        self.url.add_suffix(load)
        self.url.connect("entry-activated", lambda *_: self._load())
        src.add(self.url)
        page.add(src)

        self.list = Adw.PreferencesGroup(title="Skills in it")
        self.search = Gtk.SearchEntry(placeholder_text="Filter", valign=Gtk.Align.CENTER, visible=False)
        self.search.connect("search-changed", lambda *_: self._filter())
        self.list.set_header_suffix(self.search)
        page.add(self.list)

        to = Adw.PreferencesGroup(title="Add them for")
        self.targets: dict[str, Adw.SwitchRow] = {}
        for target, (label, rel) in TARGETS.items():
            row = Adw.SwitchRow(title=label, subtitle=f"~/{rel}", active=target == "claude")
            self.targets[target] = row
            to.add(row)
        install = Adw.ButtonRow(title="Add selected skills", start_icon_name="list-add-symbolic")
        install.add_css_class("suggested-action")
        install.connect("activated", lambda *_: self._install())
        to.add(install)
        page.add(to)

        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self._load()

    def _load(self) -> None:
        url = self.url.get_text().strip()
        self.list.set_description("Getting the repository…")
        bg(lambda: skills.browse(self.s.ssh, url), self._loaded)

    def _loaded(self, got: list[Skill] | None, err: str) -> None:
        for _, check in self.found:
            self.list.remove(check.get_parent().get_parent().get_parent())  # the row
        self.found = []
        if err:
            self.list.set_description(f"Could not load: {err}")
            return
        self.list.set_description(f"{len(got)} skills. Tick the ones you want." if got else "No skills found.")
        self.search.set_visible(len(got) > 8)
        for sk in got:
            row = _row(sk)
            check = Gtk.CheckButton(valign=Gtk.Align.CENTER)
            row.add_prefix(check)
            row.set_activatable_widget(check)
            row.haystack = f"{sk.name} {sk.description} {sk.path}".lower()
            self.list.add(row)
            self.found.append((sk, check))

    def _filter(self) -> None:
        q = self.search.get_text().lower().split()
        for _, check in self.found:
            row = check.get_parent().get_parent().get_parent()
            row.set_visible(all(w in row.haystack for w in q))

    def _install(self) -> None:
        picked = [sk for sk, check in self.found if check.get_active()]
        targets = [t for t, row in self.targets.items() if row.get_active()]
        if not picked or not targets:
            self.list.set_description("Tick at least one skill and one agent.")
            return
        s = self.s
        self.close()

        def done(res, err):
            err = err or (res.stderr.strip() if res and res.returncode else "")
            self.toast(f"Could not add skills: {err}" if err else f"Added {len(picked)} skill(s)")
            self.on_done()
        bg(lambda: s.ssh.run(skills.install_command(picked, targets), timeout=60), done)
