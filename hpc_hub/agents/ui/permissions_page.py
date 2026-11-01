"""Permissions page: tick the commands Claude may run without asking, per cluster."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ...connect.session import ClusterSession
from ...ui.widgets import bg
from .. import lock, permissions
from ..permissions import ASKS, GROUPS, Permissions
from .lock_setup import LockSetupDialog


class PermissionsPage(Gtk.Box):
    def __init__(self, sessions: list[ClusterSession], toast: Callable[[str], None]):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.sessions, self.toast = sessions, toast
        self.perm: Permissions | None = None
        self.lock: dict = {}
        self.checks: dict[str, Gtk.CheckButton] = {}

        bar = Gtk.Box(spacing=8, margin_top=12, margin_bottom=6, margin_start=12, margin_end=12)
        self.cluster = Gtk.DropDown.new_from_strings([s.cfg.name for s in sessions])
        self.save_btn = Gtk.Button(label="Save", css_classes=["suggested-action"], sensitive=False)
        self.save_btn.connect("clicked", lambda *_: self.save())
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Reload from the cluster")
        refresh.connect("clicked", lambda *_: self.refresh())
        for w in (self.cluster, Gtk.Box(hexpand=True), refresh, self.save_btn):
            bar.append(w)
        self.append(bar)

        self.page = Adw.PreferencesPage(vexpand=True)
        self.groups: list[Adw.PreferencesGroup] = []
        self.append(self.page)
        self.cluster.connect("notify::selected", lambda *_: self.refresh())
        self.connect("map", lambda *_: self.perm is None and self.refresh())

    @property
    def session(self) -> ClusterSession:
        return self.sessions[self.cluster.get_selected()]

    def _group(self, **kw) -> Adw.PreferencesGroup:
        g = Adw.PreferencesGroup(**kw)
        self.page.add(g)
        self.groups.append(g)
        return g

    def _clear(self) -> None:
        for g in self.groups:
            self.page.remove(g)
        self.groups, self.checks = [], {}
        self.save_btn.set_sensitive(False)

    def refresh(self) -> None:
        s = self.session
        self._clear()
        if not s.connected:
            self._group(description=f"Connect to {s.cfg.name} to see what Claude may run there.")
            return
        self._group(description="Loading…")
        bg(lambda: (permissions.read(s.ssh), lock.status(s.ssh)),
           lambda got, err: self._show(s, *(got or (None, {})), err))

    def _show(self, s: ClusterSession, p: Permissions | None, lock_status: dict, err: str) -> None:
        if s is not self.session:
            return
        self._clear()
        if err or p is None:
            self._group(description=f"Could not read Claude's settings: {err}")
            return
        self.perm, self.lock = p, lock_status
        self.save_btn.set_sensitive(True)

        main = self._group(title="Claude", description="Saved in ~/.claude/settings.json")
        self.edits = Adw.SwitchRow(title="Edit files without asking", active=p.accept_edits)
        self.trash = Adw.SwitchRow(title="Use trash instead of rm", active=p.trash,
                                   subtitle="rm is blocked. Deleted files stay in .trash for 7 days")
        main.add(self.edits)
        main.add(self.trash)

        ask = self._group(title="Always ask first", description="Even when allowed below")
        self.asks: dict[str, Adw.SwitchRow] = {}
        for key, label in ASKS:
            row = Adw.SwitchRow(title=label, active=key in p.ask)
            ask.add(row)
            self.asks[key] = row

        self._lock_group(s, lock_status)

        allow = self._group(title="Run without asking", description="Anything not ticked asks you first")
        for title, note, cmds in GROUPS:
            allow.add(self._expander(title, note, cmds, p.allowed))
        self.other = self._expander("Your own", "Commands you added", p.custom, p.allowed)
        allow.add(self.other)
        add = Adw.EntryRow(title="Add a command, like conda or ./run.sh", show_apply_button=True)
        add.connect("apply", lambda row: self._add(row))
        allow.add(add)
        self._group(description="ChatGPT and Antigravity ask before running commands.")

    def _lock_group(self, s: ClusterSession, st: dict) -> None:
        g = self._group(title="Passcode lock",
                        description="Claude takes no messages until you start one with the code from your "
                                    "authenticator app, like: 123456 fix the tests. Keeps the cluster safe if "
                                    "someone gets into your Claude account.")
        if not st.get("set_up"):
            row = Adw.ButtonRow(title="Set up with Google Authenticator", start_icon_name="channel-secure-symbolic")
            row.connect("activated", lambda *_: LockSetupDialog(s, self._lock_done).present(self))
            g.add(row)
            return
        conf = st.get("config", {})
        if st.get("locked"):
            row = Adw.ActionRow(title="Locked after too many wrong codes",
                                subtitle="Someone typed wrong codes. Check Recent activity", css_classes=["error"])
            unlock = Gtk.Button(label="Unlock", valign=Gtk.Align.CENTER)
            unlock.connect("clicked", lambda *_: self._lock_action(lock.reset, "Unlocked"))
            row.add_suffix(unlock)
            g.add(row)
        self.minutes = Adw.SpinRow.new_with_range(0, 240, 1)
        self.minutes.set_title("Minutes a code keeps a session open")
        self.minutes.set_subtitle("0 asks for a code on every message (safest)")
        self.minutes.set_value(conf.get("minutes", 10))
        self.tries = Adw.SpinRow.new_with_range(1, 10, 1)
        self.tries.set_title("Wrong codes before Claude is stopped")
        self.tries.set_value(conf.get("tries", 3))
        self.logout = Adw.SwitchRow(title="Then sign Claude out", active=conf.get("logout", True))
        self.scancel = Adw.SwitchRow(title="Then cancel Claude's job", active=conf.get("scancel", True))
        for w in (self.minutes, self.tries, self.logout, self.scancel):
            g.add(w)
        log = Adw.ExpanderRow(title="Recent activity", subtitle=f"{st.get('open', 0)} sessions open now")
        for line in reversed(st.get("log", [])[-10:]):
            log.add_row(Adw.ActionRow(title=GLib.markup_escape_text(line), css_classes=["monospace"]))
        g.add(log)
        off = Adw.ButtonRow(title="Turn off passcode lock", css_classes=["destructive-action"])
        off.connect("activated", lambda *_: self._confirm_off(s))
        g.add(off)

    def _lock_done(self, message: str) -> None:
        self.toast(message)
        self.refresh()  # the lock edited settings.json; read it again before anything saves over it

    def _lock_action(self, work, message: str) -> None:
        s = self.session
        bg(lambda: work(s.ssh), lambda _r, err: self._lock_done(f"Could not do it: {err}" if err else message))

    def _confirm_off(self, s: ClusterSession) -> None:
        d = Adw.AlertDialog(heading=f"Turn off the passcode lock on {s.cfg.name}?",
                            body="Claude will take messages without a code again.")
        d.add_response("cancel", "Cancel")
        d.add_response("off", "Turn off")
        d.set_response_appearance("off", Adw.ResponseAppearance.DESTRUCTIVE)
        d.connect("response", lambda _d, r: r == "off" and self._lock_action(lock.uninstall, "Passcode lock is off"))
        d.present(self)

    def _expander(self, title: str, note: str, cmds: list[str], allowed: set[str]) -> Adw.ExpanderRow:
        exp = Adw.ExpanderRow(title=title)
        everything = Gtk.CheckButton(valign=Gtk.Align.CENTER, tooltip_text="All of them")
        exp.add_prefix(everything)
        exp.cmds, exp.note, exp.everything, exp.busy = list(cmds), note, everything, False

        def toggle_all(btn):
            if exp.busy:
                return
            for c in exp.cmds:
                self.checks[c].set_active(btn.get_active())
        everything.connect("toggled", toggle_all)
        for c in cmds:
            self._check_row(exp, c, c in allowed)
        self._count(exp)
        return exp

    def _check_row(self, exp: Adw.ExpanderRow, cmd: str, active: bool) -> None:
        check = Gtk.CheckButton(active=active, valign=Gtk.Align.CENTER)
        row = Adw.ActionRow(title=cmd, activatable_widget=check)
        row.add_prefix(check)
        check.connect("toggled", lambda *_: self._count(exp))
        exp.add_row(row)
        self.checks[cmd] = check

    def _count(self, exp: Adw.ExpanderRow) -> None:
        on = sum(self.checks[c].get_active() for c in exp.cmds if c in self.checks)
        text = f"{on} of {len(exp.cmds)} allowed"
        exp.set_subtitle(f"{text}. {exp.note}" if exp.note else text)
        exp.busy = True
        exp.everything.set_active(bool(exp.cmds) and on == len(exp.cmds))
        exp.everything.set_inconsistent(0 < on < len(exp.cmds))
        exp.busy = False

    def _add(self, row: Adw.EntryRow) -> None:
        cmd = row.get_text().strip().split(" ")[0]
        row.set_text("")
        if not cmd or cmd == "rm":
            self.toast("rm can't be allowed. Use trash instead" if cmd == "rm" else "")
            return
        if cmd in self.checks:
            self.checks[cmd].set_active(True)
            return
        self.other.cmds.append(cmd)
        self._check_row(self.other, cmd, True)
        self._count(self.other)
        self.other.set_expanded(True)

    def save(self) -> None:
        s, p = self.session, self.perm
        if not p:
            return
        p.allowed = {c for c, check in self.checks.items() if check.get_active()}
        p.trash, p.accept_edits = self.trash.get_active(), self.edits.get_active()
        p.ask = {k for k, row in self.asks.items() if row.get_active()}
        self.save_btn.set_sensitive(False)

        def done(_res, err):
            self.save_btn.set_sensitive(True)
            self.toast(f"Could not save: {err}" if err else
                       f"Saved on {s.cfg.name}. Running Claude sessions pick it up when restarted")
        lock_on = bool(self.lock.get("set_up"))
        conf = (int(self.minutes.get_value()), int(self.tries.get_value()), self.logout.get_active(),
                self.scancel.get_active()) if lock_on else None

        def work():
            permissions.save(s.ssh, p)
            if conf:
                lock.configure(s.ssh, *conf)
        bg(work, done)
