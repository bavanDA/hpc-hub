"""Jobs tab: my jobs, my history or all jobs, with filters, details and cancel."""

import re
import threading
import time
from collections.abc import Callable

from gi.repository import Adw, Gio, GLib, GObject, Gtk, Pango

from .. import slurm, tmux
from ..session import ClusterSession, State
from ..slurm import JobInfo
from .widgets import bg

REFRESH_SECONDS = 15
SCOPES = [(slurm.MINE, "My jobs"), (slurm.HISTORY, "My history (7 days)"), (slurm.ALL, "All jobs")]
STATES = ["Any state", "RUNNING", "PENDING", "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"]
STATE_CLASS = {"RUNNING": "success", "PENDING": "warning", "COMPLETING": "accent",
               "FAILED": "error", "TIMEOUT": "error", "OUT_OF_MEMORY": "error", "NODE_FAIL": "error"}
COLUMNS = [  # (title, attribute, expand)
    ("ID", "job_id", False), ("Name", "name", True), ("User", "user", False),
    ("Partition · QoS", "queue", False), ("State", "state", False), ("Time / limit", "time", False),
    ("CPUs · mem", "res", False), ("SU used / max", "su", False),
    ("Node / reason", "where", False),
]
ACTIVE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED", "COMPLETING")


def su_text(j: JobInfo) -> str:
    """SU = core hours charged. Free QoS (usage factor 0) costs nothing."""
    if j.factor == 0:
        return "free"
    if j.state in ACTIVE:
        return f"{j.su_spent:,.1f} / {j.su_max:,.0f}"
    return f"{j.su_spent:,.1f}"


def usage_text(accounts: list[slurm.AccountUsage]) -> str:
    used = [a for a in accounts if a.used or a.mine] or accounts[:1]
    return " · ".join(f"{a.account}: {a.used:,} of {a.quota:,} SU used ({100 * a.used // max(a.quota, 1)}%), "
                      f"yours {a.mine:,}" for a in used)


class JobItem(GObject.Object):
    def __init__(self, job: JobInfo):
        super().__init__()
        self.job = job


def _setup(_f, item, shorten: bool):
    """Only the wide text columns (name, node) shorten; ids, times and numbers stay whole."""
    label = Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.END if shorten else Pango.EllipsizeMode.NONE,
                      width_chars=12 if shorten else -1)
    item.set_child(label)


def _binder(attr: str):
    def bind(_f, item):
        label: Gtk.Label = item.get_child()
        job: JobInfo = item.get_item().job
        text = (su_text(job) if attr == "su" else f"{job.elapsed} / {job.limit}" if attr == "time"
                else f"{job.cpus} · {job.mem}" if attr == "res"
                else " · ".join(x for x in (job.partition, job.qos) if x) if attr == "queue" else getattr(job, attr))
        if attr == "name" and job.from_app:
            text = f"{text}  (started by HPC Hub)"
        label.set_label(text)
        label.set_tooltip_text(text)
        for c in set(STATE_CLASS.values()):
            label.remove_css_class(c)
        if attr == "state" and text in STATE_CLASS:
            label.add_css_class(STATE_CLASS[text])
    return bind


class JobsPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions = sessions
        self.toast = toast
        self.loading = False
        self.store = Gio.ListStore(item_type=JobItem)

        bar = Gtk.Box(spacing=8, margin_top=12, margin_bottom=12, margin_start=12, margin_end=12)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        self.scope = Gtk.DropDown.new_from_strings([label for _, label in SCOPES])
        self.state = Gtk.DropDown.new_from_strings(STATES)
        self.search = Gtk.SearchEntry(placeholder_text="Filter by id, name, user, partition", hexpand=True)
        self.refresh_btn = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        for w in (self.cluster, self.scope, self.state, self.search, self.refresh_btn):
            bar.append(w)
        self.append(bar)

        self.filter = Gtk.CustomFilter.new(self._match)
        filtered = Gtk.FilterListModel(model=self.store, filter=self.filter)
        self.selection = Gtk.SingleSelection(model=filtered, autoselect=False, can_unselect=True)
        self.view = Gtk.ColumnView(model=self.selection, show_row_separators=True, reorderable=False)
        self.view.add_css_class("data-table")
        for title, attr, expand in COLUMNS:
            factory = Gtk.SignalListItemFactory()
            factory.connect("setup", _setup, expand)
            factory.connect("bind", _binder(attr))
            col = Gtk.ColumnViewColumn(title=title, factory=factory, expand=expand, resizable=True)
            self.view.append_column(col)
            if attr == "user":
                self.user_col = col  # only "All jobs" needs it; the rest are yours
        stop = Gtk.SignalListItemFactory()
        stop.connect("setup", self._stop_setup)
        stop.connect("bind", self._stop_bind)
        self.view.append_column(Gtk.ColumnViewColumn(title="", factory=stop, fixed_width=96))
        self.view.connect("activate", lambda _v, pos: self._details(self._job_at(pos)))

        self.empty = Adw.StatusPage(icon_name="view-list-symbolic")
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=self.view), "list")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)

        actions = Gtk.ActionBar()
        self.updated = Gtk.Label(css_classes=["dim-label", "caption"])
        actions.pack_start(self.updated)
        self.usage = Gtk.Label(css_classes=["caption"], ellipsize=Pango.EllipsizeMode.END,
                               tooltip_text="Service units (core hours) of your Slurm accounts. A QoS that charges 0 (like low on "
                                            "Wulver) is free.")
        self.usage_of: dict[str, tuple[float, list[slurm.AccountUsage]]] = {}  # cluster -> (when, accounts)
        actions.set_center_widget(self.usage)
        self.cancel_btn = Gtk.Button(label="Cancel job", css_classes=["destructive-action"], sensitive=False)
        self.details_btn = Gtk.Button(label="Details", sensitive=False)
        actions.pack_end(self.cancel_btn)
        actions.pack_end(self.details_btn)
        self.append(actions)

        self.cluster.connect("notify::selected", lambda *_: self.refresh())
        self.scope.connect("notify::selected", lambda *_: self.refresh())
        self.state.connect("notify::selected", lambda *_: self.filter.changed(Gtk.FilterChange.DIFFERENT))
        self.search.connect("search-changed", lambda *_: self.filter.changed(Gtk.FilterChange.DIFFERENT))
        self.refresh_btn.connect("clicked", lambda *_: self.refresh())
        self.selection.connect("notify::selected-item", lambda *_: self._sync_buttons())
        self.details_btn.connect("clicked", lambda *_: self._details(self._selected()))
        self.cancel_btn.connect("clicked", lambda *_: self._confirm_cancel(self._selected()))

        self.refresh()
        GLib.timeout_add_seconds(REFRESH_SECONDS, self._auto_refresh)

    # -- data -------------------------------------------------------------------
    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def session_changed(self, session: ClusterSession) -> None:
        if session is self.session:
            self.refresh()

    def _auto_refresh(self) -> bool:
        if self.get_mapped() and self.session.state == State.CONNECTED:
            self.refresh(quiet=True)
        return True

    def refresh(self, quiet: bool = False) -> None:
        s = self.session
        if not s.connected:
            self.store.remove_all()
            if s.state == State.ERROR and s.detail == "Connection lost":
                self._show_empty("Connection lost", f"{s.cfg.name} dropped, for example after the laptop slept. "
                                 "Press Reconnect on the Clusters tab.", "network-offline-symbolic")
            else:
                self._show_empty("Not connected", f"Connect to {s.cfg.name} to see jobs.", "network-offline-symbolic")
            return
        if self.loading:
            return
        self.loading = True
        self.refresh_btn.set_sensitive(False)
        if not quiet:
            self.updated.set_label("Loading…")
        scope = SCOPES[self.scope.get_selected()][0]
        self.user_col.set_visible(scope == slurm.ALL)

        def work():
            try:
                jobs, err = slurm.list_jobs(s.ssh, scope), None
                self._fetch_usage(s)
            except Exception as e:  # noqa: BLE001 - show any failure
                jobs, err = [], str(e)
                try:
                    lost = not s.healthy()  # the link died, not Slurm: let the card say so
                except Exception:  # noqa: BLE001
                    lost = False
                if lost:
                    GLib.idle_add(lambda: s.mark_lost() and False)
            GLib.idle_add(self._loaded, s, scope, jobs, err)

        threading.Thread(target=work, daemon=True).start()

    def _loaded(self, s, scope, jobs, err) -> bool:
        self.loading = False
        self.refresh_btn.set_sensitive(True)
        if s is not self.session or scope != SCOPES[self.scope.get_selected()][0]:
            self.refresh()
            return False
        if err:
            self._show_empty("Could not load jobs", err, "dialog-error-symbolic")
            return False
        keep = self._selected().job_id if self._selected() else None
        self.store.splice(0, self.store.get_n_items(), [JobItem(j) for j in jobs])
        self.updated.set_label(f"{len(jobs)} jobs · updated {time.strftime('%H:%M:%S')}")
        self.usage.set_label(usage_text(self.usage_of.get(s.cfg.id, (0, []))[1]))
        if not jobs:
            self._show_empty("No jobs", "Nothing to show for this view.", "view-list-symbolic")
        else:
            self.stack.set_visible_child_name("list")
            self._reselect(keep)
        return False

    def _fetch_usage(self, s: ClusterSession) -> None:
        """Account totals change slowly: ask at most every 5 minutes. Worker thread."""
        when, _ = self.usage_of.get(s.cfg.id, (0, []))
        if time.monotonic() - when < 300 and when:
            return
        try:
            self.usage_of[s.cfg.id] = (time.monotonic(), slurm.account_usage(s.ssh))
        except Exception:  # noqa: BLE001 - totals are a nice to have
            pass

    def _show_empty(self, title: str, text: str, icon: str) -> None:
        self.empty.set_title(title)
        self.empty.set_description(GLib.markup_escape_text(text))
        self.empty.set_icon_name(icon)
        self.stack.set_visible_child_name("empty")
        self.updated.set_label("")
        self.usage.set_label("")
        self._sync_buttons()

    def _match(self, item: JobItem) -> bool:
        j = item.job
        state = STATES[self.state.get_selected()]
        if self.state.get_selected() and j.state != state:
            return False
        q = self.search.get_text().strip().lower()
        return not q or any(q in v.lower() for v in (j.job_id, j.name, j.user, j.partition))

    # -- selection & actions -------------------------------------------------------
    def _job_at(self, pos: int) -> JobInfo | None:
        item = self.selection.get_model().get_item(pos)
        return item.job if item else None

    def _selected(self) -> JobInfo | None:
        item = self.selection.get_selected_item()
        return item.job if item else None

    def _reselect(self, job_id: str | None) -> None:
        model = self.selection.get_model()
        for i in range(model.get_n_items()):
            if job_id and model.get_item(i).job.job_id == job_id:
                self.selection.set_selected(i)
                return
        self.selection.set_selected(Gtk.INVALID_LIST_POSITION)

    def _cancellable(self, j: JobInfo | None) -> bool:
        s = self.session
        mine = bool(s.ssh) and j is not None and j.user == s.ssh.username
        return mine and j.state in ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED")

    def _stop_setup(self, _f, item) -> None:
        b = Gtk.Button(label="Cancel", css_classes=["error"], tooltip_text="Cancel this job…",
                       halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER)
        b.connect("clicked", lambda btn: self._confirm_cancel(btn.job))
        item.set_child(b)

    def _stop_bind(self, _f, item) -> None:
        b, job = item.get_child(), item.get_item().job
        b.job = job
        ok = self._cancellable(job)
        b.set_opacity(1 if ok else 0)  # keep its space so every row is the same height
        b.set_can_target(ok)

    def _sync_buttons(self) -> None:
        j = self._selected()
        self.details_btn.set_sensitive(j is not None)
        self.cancel_btn.set_sensitive(self._cancellable(j))

    def _details(self, j: JobInfo | None) -> None:
        if not j or not self.session.ssh:
            return
        s = self.session
        page = Adw.PreferencesPage()
        page.add(Adw.PreferencesGroup(description="Loading…"))
        header = Adw.HeaderBar()
        toolbar = Adw.ToolbarView(content=page)
        toolbar.add_top_bar(header)
        if self._cancellable(j):
            cancel = Gtk.Button(label="Cancel job", css_classes=["destructive-action"])
            cancel.connect("clicked", lambda *_: (dialog.close(), self._confirm_cancel(j)))
            header.pack_start(cancel)
        dialog = Adw.Dialog(title=f"Job {j.job_id} · {j.name}", content_width=600, content_height=640,
                            child=toolbar)
        dialog.present(self.get_root())

        bg(lambda: slurm.job_details(s.ssh, j.job_id),
           lambda text, err: self._fill_details(dialog, toolbar, j, text or err))

    def _fill_details(self, dialog: Adw.Dialog, toolbar: Adw.ToolbarView, j: JobInfo, text: str) -> None:
        """The few fields people look at, grouped; everything else behind "All fields"."""
        d = slurm.parse_details(text)

        def get(*keys: str) -> str:
            for k in keys:
                v = d.get(k, "")
                if v and v not in ("(null)", "None", "N/A", "Unknown"):
                    return v
            return ""

        tres = get("AllocTRES", "ReqTRES")
        gpus = re.findall(r"gres/gpu(?::[^=,]+)?=(\d+)", tres)
        state, reason = get("JobState", "State"), get("Reason")

        def when(*keys: str) -> str:  # 2026-10-19T17:07:01 -> 2026-10-19 17:07
            return get(*keys).replace("T", " ")[:16]

        groups = [
            ("Status", [
                ("State", f"{state} ({reason})" if reason else state),
                ("Run time", " of ".join(x for x in (get("RunTime", "Elapsed"), get("TimeLimit", "Timelimit")) if x)),
                ("Started", when("StartTime", "Start")),
                ("Ends" if state in ("RUNNING", "PENDING") else "Ended", when("EndTime", "End")),
                ("Submitted", when("SubmitTime", "Submit")),
                ("Exit code", get("ExitCode") if state not in ("RUNNING", "PENDING") else ""),
            ]),
            ("Resources", [
                ("Node", get("NodeList")),
                ("CPUs", get("NumCPUs", "AllocCPUS")),
                ("Memory", (re.search(r"mem=([^,]+)", tres) or [None, get("ReqMem")])[1]),
                ("GPUs", str(sum(int(g) for g in gpus)) if gpus else ""),
                ("Partition · QoS · account", " · ".join(x for x in (get("Partition"), get("QOS"), get("Account")) if x)),
                ("SU", su_text(j) if j.state else ""),
            ]),
            ("Files", [
                ("Work folder", get("WorkDir")),
                ("Output", get("StdOut")),
                ("Errors", get("StdErr") if get("StdErr") != get("StdOut") else ""),
            ]),
        ]
        page = Adw.PreferencesPage()
        for title, rows in groups:
            group = Adw.PreferencesGroup(title=title)
            for label, value in rows:
                if not value:
                    continue
                if title != "Files":  # short values: label left, value right, one line each
                    row = Adw.ActionRow(title=label)
                    row.add_suffix(Gtk.Label(label=value, selectable=True, xalign=1))
                    group.add(row)
                    continue
                row = Adw.ActionRow(title=label, subtitle=GLib.markup_escape_text(value), subtitle_selectable=True,
                                    css_classes=["property"])
                copy = Gtk.Button(icon_name="edit-copy-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER,
                                  tooltip_text="Copy path")
                copy.connect("clicked", lambda b, v=value: (b.get_clipboard().set(v), self.toast("Path copied")))
                row.add_suffix(copy)
                group.add(row)
            page.add(group)
        raw = Gtk.Label(label=text, xalign=0, selectable=True, wrap=True, wrap_mode=Pango.WrapMode.WORD_CHAR,
                        css_classes=["monospace", "caption"], margin_top=6)
        more = Adw.PreferencesGroup()
        more.add(Gtk.Expander(label="All fields", child=raw))
        page.add(more)
        toolbar.set_content(page)

    def _confirm_cancel(self, j: JobInfo | None) -> None:
        """Say exactly what stops (node, time used, sessions on it), default to keeping it."""
        if not j or not self.session.ssh:
            return
        s = self.session

        def look():  # sessions the app started on this job are named hpchub-<agent>-<job>-...
            return [t.title for t in tmux.list_sessions(s.ssh).sessions if f"-{j.job_id}-" in t.name]
        bg(look, lambda inside, _err: self._ask_cancel(s, j, inside or []))

    def _ask_cancel(self, s: ClusterSession, j: JobInfo, inside: list[str]) -> None:
        app_node = s.allocation is not None and s.allocation.job_id == j.job_id
        lines = [f"{j.name} · {j.partition}",
                 f"Node: {j.where}" if j.state == "RUNNING" else f"Waiting: {j.where}",
                 f"Running for {j.elapsed} of {j.limit}" if j.state == "RUNNING" else None]
        if inside:
            lines.append("Running in it: " + ", ".join(inside))
        if app_node:
            lines.append("HPC Hub is using this node.")
        lines.append("")
        lines.append("Everything running in this job stops right away and can't be brought back."
                     if j.state == "RUNNING" else "It leaves the queue. Nothing has started yet.")
        dialog = Adw.AlertDialog(heading=f"Cancel job {j.job_id}?", body="\n".join(l for l in lines if l is not None))
        dialog.add_response("cancel", "Cancel job")  # stacked buttons show the last one on top
        dialog.add_response("keep", "Keep running" if j.state == "RUNNING" else "Keep waiting")
        dialog.set_response_appearance("cancel", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.set_default_response("keep")
        dialog.set_close_response("keep")

        def on_response(_d, response):
            if response != "cancel":
                return
            self.toast(f"Cancelling job {j.job_id}…")

            def work():
                slurm.cancel_job(s.ssh, j.job_id)
                if app_node:
                    s.allocation = None
                    s.listener.state_changed(s)
                return slurm.wait_gone(s.ssh, j.job_id)

            def done(gone, err):
                self.toast(f"Could not cancel job {j.job_id}: {err}" if err
                           else f"Job {j.job_id} is cancelled and gone from the queue" if gone
                           else f"Cancel sent. Slurm is still stopping job {j.job_id}")
                self.refresh(quiet=True)
            bg(work, done)

        dialog.connect("response", on_response)
        dialog.present(self.get_root())
