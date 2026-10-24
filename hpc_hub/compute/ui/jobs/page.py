"""JobsPage: the job table with its filters, refresh and SU totals."""

import threading
import time
from collections.abc import Callable

from gi.repository import Adw, Gio, GLib, Gtk, Pango

from ....connect.session import ClusterSession, State
from ...jobs import ALL, HISTORY, MINE, JobInfo, list_jobs
from ...usage import AccountUsage, account_usage
from .cancel import CancelMixin
from .columns import JobItem, add_columns
from .details import DetailsMixin

REFRESH_SECONDS = 15
SCOPES = [(MINE, "My jobs"), (HISTORY, "My history (7 days)"), (ALL, "All jobs")]
STATES = ["Any state", "RUNNING", "PENDING", "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"]


def usage_text(accounts: list[AccountUsage]) -> str:
    used = [a for a in accounts if a.used or a.mine] or accounts[:1]
    return " · ".join(f"{a.account}: {a.used:,} of {a.quota:,} SU used ({100 * a.used // max(a.quota, 1)}%), "
                      f"yours {a.mine:,}" for a in used)


class JobsPage(DetailsMixin, CancelMixin, Gtk.Box):
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
        self.user_col = add_columns(self.view)
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
                               tooltip_text="Service units (core hours) of your Slurm accounts. "
                                            "A QoS that charges 0 (like low on Wulver) is free.")
        self.usage_of: dict[str, tuple[float, list[AccountUsage]]] = {}  # cluster -> (when, accounts)
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
        self.user_col.set_visible(scope == ALL)

        def work():
            try:
                jobs, err = list_jobs(s.ssh, scope), None
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
            self.usage_of[s.cfg.id] = (time.monotonic(), account_usage(s.ssh))
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
