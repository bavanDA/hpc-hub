"""Scheduled agents page: agents that run a task on their own (e.g. clean the code every night at 02:00)."""

import posixpath
import re
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import schedules
from ..agents import AGENTS
from ..projects import Project, ProjectStore
from ..schedules import PRESETS, Schedule, Status
from ..session import ClusterSession
from .folder_picker import FolderPicker
from .widgets import bg

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _when(stamp: str) -> str:
    """2026-10-20T02:00:00 -> Oct 20 02:00"""
    try:
        return time.strftime("%b %d %H:%M", time.strptime(stamp, "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return stamp


class SchedulesPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None], save_config: Callable[[], None],
                 store: ProjectStore | None = None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions, self.toast, self.save_config, self.store = sessions, toast, save_config, store
        self.on_open_folder: Callable[[ClusterSession, str], None] | None = None  # set by the app

        bar = Gtk.Box(spacing=8, margin_top=12, margin_bottom=6, margin_start=12, margin_end=12)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        new = Gtk.Button(child=Adw.ButtonContent(label="New schedule", icon_name="list-add-symbolic"),
                         css_classes=["suggested-action"])
        new.connect("clicked", lambda *_: self.edit(None))
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        refresh.connect("clicked", lambda *_: self.refresh())
        bar.append(self.cluster)
        bar.append(Gtk.Box(hexpand=True))
        bar.append(new)
        bar.append(refresh)
        self.append(bar)

        self.list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.note = Gtk.Label(xalign=0, wrap=True, css_classes=["dim-label", "caption"])
        col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin_top=12, margin_bottom=24,
                      margin_start=16, margin_end=16)
        col.append(self.note)
        col.append(self.list)
        col.append(Gtk.Label(wrap=True, xalign=0, css_classes=["dim-label", "caption"], label=(
            "Each schedule is a Slurm job that waits for its time, runs the agent once, then queues the next run. "
            "It keeps going with your laptop off. Answers are saved in its logs folder.")))
        self.append(Gtk.ScrolledWindow(child=Adw.Clamp(maximum_size=900, child=col), vexpand=True))
        self.status: list[Status] = []

        self.cluster.connect("notify::selected", lambda *_: self.refresh())
        self.connect("map", lambda *_: self.refresh())

    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def refresh(self) -> None:
        s = self.session
        self.list.remove_all()
        if not s.connected:
            self.note.set_label(f"Connect to {s.cfg.name} to see its scheduled agents.")
            return
        self.note.set_label("Loading…")
        bg(lambda: schedules.list_schedules(s.ssh), lambda got, err: self._show(s, got or [], err))

    def _show(self, s: ClusterSession, got: list[Status], err: str) -> None:
        if s is not self.session:
            return
        self.status = got
        self.list.remove_all()
        if err:
            self.note.set_label(f"Could not load: {err}")
            return
        self.note.set_label("" if got else "No scheduled agents yet. Press New schedule.")
        for st in got:
            self.list.append(self._row(s, st))

    def _row(self, s: ClusterSession, st: Status) -> Adw.ActionRow:
        sc = st.schedule
        agent = next((a for a in AGENTS if a.id == sc.agent), AGENTS[0])
        bits = [agent.name, sc.folder, sc.when]
        if st.state == "RUNNING":
            bits.append("running now")
        elif st.state == "PENDING" and sc.enabled:
            bits.append(f"next {_when(st.start)}")
        elif sc.enabled:
            bits.append("not queued, press Save in Edit to queue it")
        if st.last_run:
            bits.append(f"last {time.strftime('%b %d %H:%M', time.localtime(st.last_run))}")
        row = Adw.ActionRow(title=GLib.markup_escape_text(sc.name), subtitle=GLib.markup_escape_text(" · ".join(bits)),
                            subtitle_lines=2)
        row.add_prefix(Gtk.Image(icon_name=agent.icon))
        on = Gtk.Switch(active=sc.enabled, valign=Gtk.Align.CENTER, tooltip_text="On: runs on schedule")
        on.connect("notify::active", lambda sw, *_: sw.get_active() != sc.enabled and self._toggle(s, sc, sw.get_active()))
        row.add_suffix(on)
        for icon, tip, fn in (("media-playback-start-symbolic", "Run once now", lambda: self._run_now(s, sc)),
                              ("folder-open-symbolic", "Open its logs", lambda: self._logs(s, sc)),
                              ("document-edit-symbolic", "Edit", lambda: self.edit(sc)),
                              ("user-trash-symbolic", "Delete", lambda: self._delete(s, sc))):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"], valign=Gtk.Align.CENTER)
            b.connect("clicked", lambda *_, f=fn: f())
            row.add_suffix(b)
        return row

    # -- actions --------------------------------------------------------------------------
    def _save(self, s: ClusterSession, sc: Schedule, done_msg: str) -> None:
        settings = getattr(s.cfg, sc.agent)
        bg(lambda: s.ssh.run(schedules.save_command(sc, settings, s.cfg.profile), timeout=60),
           lambda res, err: self._after(err or (res.stderr.strip() if res and res.returncode else ""), done_msg))

    def _after(self, err: str, msg: str) -> None:
        self.toast(f"Failed: {err}" if err else msg)
        self.refresh()

    def _toggle(self, s: ClusterSession, sc: Schedule, on: bool) -> None:
        sc.enabled = on
        self._save(s, sc, f"{sc.name} is on" if on else f"{sc.name} is paused")

    def _run_now(self, s: ClusterSession, sc: Schedule) -> None:
        bg(lambda: s.ssh.run(schedules.run_now_command(sc.name), timeout=60),
           lambda res, err: self._after(err or (res.stderr.strip() if res and res.returncode else ""),
                                        f"{sc.name}: started a run now"))

    def _logs(self, s: ClusterSession, sc: Schedule) -> None:
        if self.on_open_folder:
            self.on_open_folder(s, posixpath.join("~", schedules.ROOT, sc.name, "logs"))

    def _delete(self, s: ClusterSession, sc: Schedule) -> None:
        d = Adw.AlertDialog(heading=f"Delete {sc.name}?",
                            body="It stops running and its task and logs are removed from the cluster.")
        d.add_response("cancel", "Cancel")
        d.add_response("delete", "Delete")
        d.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE)
        d.set_close_response("cancel")
        d.connect("response", lambda _d, r: r == "delete" and bg(
            lambda: s.ssh.run(schedules.delete_command(sc), timeout=60), lambda *_: self._after("", f"Deleted {sc.name}")))
        d.present(self.get_root())

    def edit(self, sc: Schedule | None) -> None:
        s = self.session
        if not s.connected:
            self.toast(f"Connect to {s.cfg.name} first")
            return
        taken = {st.schedule.name for st in self.status if st.schedule is not sc}
        projects = [p for p in self.store.recent() if p.cluster == s.cfg.id] if self.store else []
        ScheduleDialog(s, sc, taken, lambda new: self._save(s, new, f"Saved {new.name}"), projects).present(
            self.get_root())


class ScheduleDialog(Adw.Dialog):
    def __init__(self, s: ClusterSession, sc: Schedule | None, taken: set[str], on_save: Callable[[Schedule], None],
                 projects: list[Project] = ()):
        super().__init__(title="Edit schedule" if sc else "New schedule", content_width=600, content_height=760)
        self.s, self.sc, self.taken, self.on_save, self.projects = s, sc, taken, on_save, list(projects)
        page = Adw.PreferencesPage()

        what = Adw.PreferencesGroup()
        self.preset = Adw.ComboRow(title="Job", model=Gtk.StringList.new(list(PRESETS)))
        self.preset.connect("notify::selected", lambda *_: self._preset())
        self.agent = Adw.ComboRow(title="Agent", model=Gtk.StringList.new([a.name for a in AGENTS]))
        self.folder = Adw.EntryRow(title="Folder")
        browse = Gtk.Button(icon_name="folder-open-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER,
                            tooltip_text="Choose folder")
        browse.connect("clicked", lambda *_: FolderPicker(s, self.folder.get_text().strip() or "~",
                                                         self.folder.set_text).present(self))
        self.folder.add_suffix(browse)
        self.project = Adw.ComboRow(title="Project", model=Gtk.StringList.new(
            ["Pick a folder instead"] + [p.name for p in self.projects]))
        self.project.connect("notify::selected", lambda *_: self._project())
        self.name = Adw.EntryRow(title="Name")
        for w in (self.preset, self.agent, self.project, self.folder, self.name):
            what.add(w)
        page.add(what)

        task = Adw.PreferencesGroup(title="Task", description="What the agent does on each run.")
        self.task = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR, top_margin=8, bottom_margin=8, left_margin=10,
                                 right_margin=10, accepts_tab=False)
        task.add(Gtk.Frame(child=Gtk.ScrolledWindow(child=self.task, min_content_height=120, max_content_height=260,
                                                    propagate_natural_height=True)))
        page.add(task)

        when = Adw.PreferencesGroup(title="When")
        self.time = Adw.EntryRow(title="Time (24 h, cluster time)")
        days_row = Adw.ActionRow(title="Days", subtitle="None picked means every day")
        days_box = Gtk.Box(spacing=4, valign=Gtk.Align.CENTER, css_classes=["linked"])
        self.days: list[Gtk.ToggleButton] = []
        for name in schedules.DAY_NAMES:
            b = Gtk.ToggleButton(label=name[:2])
            self.days.append(b)
            days_box.append(b)
        days_row.add_suffix(days_box)
        self.hours = Adw.SpinRow(title="Hours each run may take", digits=0,
                                 adjustment=Gtk.Adjustment(lower=1, upper=72, step_increment=1, value=2))
        self.skip = Adw.SwitchRow(title="Allow edits without asking", active=True,
                                  subtitle="Nobody is there to approve them. It works on its own git branch.")
        for w in (self.time, days_row, self.hours, self.skip):
            when.add(w)
        page.add(when)

        save = Adw.ButtonRow(title="Save and queue", start_icon_name="alarm-symbolic")
        save.add_css_class("suggested-action")
        save.connect("activated", lambda *_: self._save())
        actions = Adw.PreferencesGroup()
        actions.add(save)
        page.add(actions)

        self._fill(sc)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.banner = Adw.Banner()
        tv.add_top_bar(self.banner)
        self.set_child(tv)

    def _fill(self, sc: Schedule | None) -> None:
        sc = sc or Schedule("", folder=self.s.cfg.claude.workdir or "~")
        self.agent.set_selected(next((i for i, a in enumerate(AGENTS) if a.id == sc.agent), 0))
        self.folder.set_text(sc.folder)
        match = next((i for i, p in enumerate(self.projects) if p.path.rstrip("/") == sc.folder.rstrip("/")), -1)
        self.project.set_selected(match + 1)
        self.name.set_text(sc.name)
        self.task.get_buffer().set_text(sc.task)
        self.time.set_text(sc.time)
        for i, b in enumerate(self.days):
            b.set_active(i + 1 in sc.days)
        self.hours.set_value(sc.hours)
        self.skip.set_active(sc.skip)
        if not self.sc:
            self._preset()

    def _project(self) -> None:
        i = self.project.get_selected()
        if 0 < i <= len(self.projects):
            self.folder.set_text(self.projects[i - 1].path)
            if not self.sc:
                self._preset()

    def _preset(self) -> None:
        label = list(PRESETS)[self.preset.get_selected()]
        role, text = PRESETS[label]
        if text:
            self.task.get_buffer().set_text(text)
        if not self.sc:
            folder = posixpath.basename(self.folder.get_text().strip().rstrip("/")) or "home"
            self.name.set_text(schedules.slug(f"{role}-{folder}"))

    def _save(self) -> None:
        buf = self.task.get_buffer()
        task = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False).strip()
        name = schedules.slug(self.name.get_text())
        at = self.time.get_text().strip()
        problem = ("Write a task" if not task else "Time must look like 02:00" if not TIME_RE.match(at)
                   else f"A schedule named {name} exists" if name in self.taken else "")
        if problem:
            self.banner.set_title(problem)
            self.banner.set_revealed(True)
            return
        days = [i + 1 for i, b in enumerate(self.days) if b.get_active()]
        sc = Schedule(name, AGENTS[self.agent.get_selected()].id, self.folder.get_text().strip() or "~", task, at,
                      [] if len(days) == 7 else days, int(self.hours.get_value()),
                      self.sc.enabled if self.sc else True, self.skip.get_active())
        if self.sc and self.sc.name != name:  # renamed: the old one goes away
            old = self.sc
            bg(lambda: self.s.ssh.run(schedules.delete_command(old), timeout=60), lambda *_: None)
        self.close()
        self.on_save(sc)
