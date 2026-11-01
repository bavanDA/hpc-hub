"""Usage tab: SU per person in your group, storage quotas and how busy the cluster is."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ...connect.session import ClusterSession
from ...ui.widgets import bg
from .. import usage


def _bar(fraction: float = 0.0) -> Gtk.LevelBar:
    """Blue while there is room, orange from 75%, red from 90%."""
    bar = Gtk.LevelBar(min_value=0, max_value=1, value=max(0.0, min(fraction, 1.0)), width_request=160,
                       valign=Gtk.Align.CENTER)
    for name in ("low", "high", "full"):
        bar.remove_offset_value(name)
    for name, at in (("ok", 0.75), ("warn", 0.9), ("over", 1.0)):
        bar.add_offset_value(name, at)
    return bar


def _pct(part: float, whole: float) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "0%"


def _list() -> Gtk.ListBox:
    return Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])


def _section(title: str, child: Gtk.Widget, note: Gtk.Widget | None = None) -> Gtk.Box:
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
    box.append(Gtk.Label(label=title, xalign=0, css_classes=["heading"]))
    if note:
        box.append(note)
    box.append(child)
    return box


def _page(*sections: Gtk.Widget) -> Gtk.ScrolledWindow:
    col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=24, margin_top=18, margin_bottom=24,
                  margin_start=16, margin_end=16)
    for s in sections:
        col.append(s)
    return Gtk.ScrolledWindow(child=Adw.Clamp(maximum_size=900, child=col), vexpand=True)


class UsagePage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions, self.toast = sessions, toast
        self.accounts: list[usage.AccountUsage] = []
        self._filling = False  # swapping the account list: don't load for each change

        bar = Gtk.Box(spacing=8, margin_top=12, margin_bottom=6, margin_start=12, margin_end=12)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        self.account = Gtk.DropDown.new_from_strings([])
        self.period = Gtk.DropDown.new_from_strings([label for label, _ in usage.PERIODS])
        self.period.set_selected(1)
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        self.stack = Adw.ViewStack(vexpand=True)
        switcher = Adw.ViewSwitcher(stack=self.stack, policy=Adw.ViewSwitcherPolicy.WIDE, hexpand=True)
        for w in (self.cluster, self.account, self.period, switcher, refresh):
            bar.append(w)
        self.append(bar)

        # SU
        self.summary = Gtk.Label(xalign=0, wrap=True)
        self.summary_bar = _bar()
        self.summary_bar.set_size_request(-1, -1)
        top = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        top.append(self.summary)
        top.append(self.summary_bar)
        self.people = _list()
        self.idle = _list()
        self.idle_box = Gtk.Expander(child=self.idle)
        self.people_note = Gtk.Label(xalign=0, wrap=True, css_classes=["dim-label", "caption"])
        self.stack.add_titled_with_icon(
            _page(_section("Account", top), _section("Who used it", self.people, self.people_note), self.idle_box),
            "su", "SU", "power-profile-balanced-symbolic")
        # storage
        self.storage = _list()
        self.storage_raw = Gtk.Label(xalign=0, selectable=True, css_classes=["monospace"], visible=False)
        self.stack.add_titled_with_icon(_page(_section("Storage", self.storage), self.storage_raw),
                                        "storage", "Storage", "drive-harddisk-symbolic")
        # load
        self.load = _list()
        self.load_note = Gtk.Label(xalign=0, wrap=True, css_classes=["dim-label", "caption"])
        self.stack.add_titled_with_icon(_page(_section("Partitions", self.load, self.load_note)),
                                        "load", "Load", "power-profile-performance-symbolic")

        self.status = Adw.StatusPage(icon_name="network-offline-symbolic", vexpand=True)
        self.outer = Gtk.Stack(vexpand=True)
        self.outer.add_named(self.stack, "main")
        self.outer.add_named(self.status, "status")
        self.append(self.outer)

        self.cluster.connect("notify::selected", lambda *_: self.refresh(accounts=True))
        self.account.connect("notify::selected", lambda *_: self._filling or self._account_changed())
        self.period.connect("notify::selected", lambda *_: self._load_people())
        refresh.connect("clicked", lambda *_: self.refresh(accounts=True))
        self.connect("map", lambda *_: self.refresh(accounts=not self.accounts))

    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def _account(self) -> usage.AccountUsage | None:
        i = self.account.get_selected()
        return self.accounts[i] if 0 <= i < len(self.accounts) else None

    def session_changed(self, session: ClusterSession) -> None:
        if session is self.session and self.get_mapped():
            self.refresh(accounts=True)

    def refresh(self, accounts: bool = False) -> None:
        s = self.session
        if not s.connected:
            self.status.set_title("Not connected")
            self.status.set_description(f"Connect to {s.cfg.name} to see its usage.")
            self.outer.set_visible_child_name("status")
            return
        self.outer.set_visible_child_name("main")
        if accounts:
            bg(lambda: usage.account_usage(s.ssh), lambda got, err: self._accounts_loaded(s, got or [], err))
        else:
            self._account_changed()
        self._load_load()

    def _account_changed(self) -> None:
        self._load_people()
        self._load_storage()

    def _accounts_loaded(self, s: ClusterSession, got: list[usage.AccountUsage], err: str) -> None:
        if s is not self.session:
            return
        busiest = max(range(len(got)), key=lambda i: got[i].used, default=0)
        self.accounts = got
        self._filling = True
        self.account.set_model(Gtk.StringList.new([a.account for a in got] or ["(no account)"]))
        self.account.set_selected(busiest)
        self._filling = False
        if err:
            self.toast(f"Could not read accounts: {err}")
        self._account_changed()

    # -- SU -----------------------------------------------------------------------------
    def _load_people(self) -> None:
        a, s = self._account(), self.session
        if not a or not s.ssh:
            self.summary.set_label("No Slurm account found.")
            return
        if a.quota:
            self.summary.set_markup(f"<b>{a.account}</b>: {a.used:,} of {a.quota:,} SU used "
                                    f"({_pct(a.used, a.quota)}) · {a.quota - a.used:,} left · yours {a.mine:,}")
        else:
            when = f" in {a.period}" if a.period else ""
            cost = f" · about ${a.used * a.rate:,.0f} at ${a.rate:g} per SU" if a.rate else ""
            self.summary.set_markup(f"<b>{a.account}</b>: {a.used:,} SU used{when}, no limit{cost} · yours {a.mine:,}")
        self.summary_bar.set_value(min(a.used / a.quota, 1) if a.quota else 0)
        label, days = usage.PERIODS[self.period.get_selected()]
        self.people_note.set_label(f"{label}. Loading…")
        bg(lambda: usage.group_usage(s.ssh, a.account, days),
           lambda got, err: self._people_loaded(s, a, label, got or [], err))

    def _people_loaded(self, s, a, label, people: list[usage.Person], err: str) -> None:
        if s is not self.session or a is not self._account():
            return
        self.people.remove_all()
        self.idle.remove_all()
        if err:
            self.people_note.set_label(f"Could not load: {err}")
            return
        total = sum(p.charged for p in people)
        hours = sum(p.hours for p in people)
        me = s.ssh.username
        active = [p for p in people if p.hours > 0]
        for p in active:
            row = Adw.ActionRow(title=GLib.markup_escape_text(f"{p.name or p.user}{'  (you)' if p.user == me else ''}"),
                                subtitle=f"{p.user} · {p.hours:,.0f} core hours")
            row.add_suffix(Gtk.Label(label=f"{p.charged:,.0f} SU · {_pct(p.charged, total)}", xalign=1,
                                     css_classes=["numeric"]))
            share = _bar(p.charged / total if total else 0)
            share.remove_offset_value("warn")  # a big share is not a problem, keep it one color
            share.remove_offset_value("over")
            share.add_offset_value("ok", 1.0)
            row.add_suffix(share)
            self.people.append(row)
        if not active:
            self.people.append(Adw.ActionRow(title="Nobody used this account in this period"))
        for p in people:
            if p.hours <= 0:
                self.idle.append(Adw.ActionRow(title=GLib.markup_escape_text(p.name or p.user), subtitle=p.user))
        idle = len(people) - len(active)
        self.idle_box.set_label(f"No usage in this period ({idle})")
        self.idle_box.set_visible(idle > 0)
        self.people_note.set_label(f"{label}: {total:,.0f} SU across {hours:,.0f} core hours (free QoS included).")

    # -- storage ------------------------------------------------------------------------
    def _load_storage(self) -> None:
        a, s = self._account(), self.session
        bg(lambda: usage.storage(s.ssh, a.account if a else ""),
           lambda got, err: self._storage_loaded(s, got, err))

    def _storage_loaded(self, s, got, err: str) -> None:
        if s is not self.session:
            return
        self.storage.remove_all()
        rows, raw = got if got else ([], err)
        for r in rows:
            sub = f"{r.used:,} of {r.quota:,} GB ({_pct(r.used, r.quota)})" if r.quota else f"{r.used:,} GB, no quota"
            if r.mine is not None and r.label != "Home":
                sub += f" · yours {r.mine:,} GB"
            row = Adw.ExpanderRow(title=r.label.capitalize(), subtitle=sub, enable_expansion=bool(r.people),
                                  show_enable_switch=False)
            row.add_suffix(_bar(r.used / r.quota if r.quota else 0))
            for user, gb in sorted(r.people.items(), key=lambda x: -x[1]):
                child = Adw.ActionRow(title=user)
                child.add_suffix(Gtk.Label(label=f"{gb:,.1f} GB · {_pct(gb, r.used)}", css_classes=["numeric"]))
                row.add_row(child)
            self.storage.append(row)
        self.storage.set_visible(bool(rows))
        self.storage_raw.set_label(raw)
        self.storage_raw.set_visible(bool(raw))

    # -- load ---------------------------------------------------------------------------
    def _load_load(self) -> None:
        s = self.session
        self.load_note.set_label("Loading…")
        bg(lambda: usage.load(s.ssh), lambda got, err: self._load_loaded(s, got or [], err))

    def _load_loaded(self, s, parts: list[usage.Partition], err: str) -> None:
        if s is not self.session:
            return
        self.load.remove_all()
        for p in parts:
            bits = [f"{p.cpus_used:,} of {p.cpus_total:,} CPUs busy ({_pct(p.cpus_used, p.cpus_total)})"]
            if p.gpus_total:
                bits.append(f"GPUs {p.gpus_used} of {p.gpus_total}")
            bits.append(f"{p.running} running, {p.pending} waiting")
            title = p.name if p.up else f"{p.name} (down)"
            row = Adw.ActionRow(title=title, subtitle=" · ".join(bits), subtitle_lines=2)
            row.add_suffix(_bar(p.cpus_used / p.cpus_total if p.cpus_total else 0))
            self.load.append(row)
        busy = sum(p.cpus_used for p in parts)
        total = sum(p.cpus_total for p in parts)
        self.load_note.set_label(f"Could not load: {err}" if err else
                                 f"{s.cfg.name}: {busy:,} of {total:,} CPUs busy ({_pct(busy, total)}). "
                                 "Many jobs waiting means a long queue.")
