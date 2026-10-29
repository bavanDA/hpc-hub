"""Set up the phone app: your logins as a QR code (core/pairing.py) the phone scans. A cluster that takes keys
gets a new key for the phone first, over the connection here. Shown only on a click, and hidden again after
SHOWN seconds, since anyone who sees the code sees what is in it."""

import threading

from gi.repository import Adw, GLib, Gtk

from ...core import credentials, pairing, ssh_keys

SHOWN = 60
MODULE = 6  # pixels per QR square


class PhonePairDialog(Adw.Dialog):
    def __init__(self, sessions: list):
        super().__init__(title="Set up the phone app", content_width=460)
        self.sessions = {s.cfg.id: s for s in sessions}
        self.rows: dict[str, Adw.SwitchRow] = {}
        self.left = 0
        self.timer = 0
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(title="Logins", description="Each login you pick goes to HPC Hub on your phone. "
                                     "Duo still asks when the phone connects.")
        for s in sessions:
            saved = credentials.load(s.cfg.id, credentials.SSH)
            if not (saved and saved.username):
                continue
            if s.cfg.key_login:
                ready = s.connected
                more = ", gets a key for the phone" if ready else ". Connect it first, to add a key for the phone"
            else:
                ready, more = True, (", password saved" if saved.password else "")
            row = Adw.SwitchRow(title=s.cfg.name, active=ready, sensitive=ready,
                                subtitle=GLib.markup_escape_text(saved.username + more))
            self.rows[s.cfg.id] = row
            group.add(row)
        if not self.rows:
            group.add(Adw.ActionRow(title="No saved logins yet", subtitle="Connect to a cluster here first."))
        page.add(group)
        extra = Adw.PreferencesGroup()
        self.passwords = Adw.SwitchRow(title="Include passwords", active=True,
                                       subtitle="Off: only the usernames. The phone asks for the password.")
        extra.add(self.passwords)
        page.add(extra)
        show = Gtk.Button(label="Show QR code", css_classes=["pill", "suggested-action"], halign=Gtk.Align.CENTER,
                          sensitive=bool(self.rows), margin_top=12)
        show.connect("clicked", lambda *_: self._show())
        extra.add(show)

        self.area = Gtk.DrawingArea(halign=Gtk.Align.CENTER)
        self.area.set_draw_func(self._draw)
        self.squares: list[list[bool]] = []
        self.spinner = Adw.Spinner(width_request=32, height_request=32, visible=False)
        self.title = Gtk.Label(css_classes=["title-2"], wrap=True, justify=Gtk.Justification.CENTER)
        self.text = Gtk.Label(wrap=True, justify=Gtk.Justification.CENTER, css_classes=["dim-label"])
        hide = Gtk.Button(label="Hide", css_classes=["pill"], halign=Gtk.Align.CENTER)
        hide.connect("clicked", lambda *_: self._hide())
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_start=24, margin_end=24,
                      margin_top=12, margin_bottom=24)
        for w in (self.spinner, self.title, self.text, self.area, hide):
            box.append(w)

        self.stack = Gtk.Stack(transition_type=Gtk.StackTransitionType.CROSSFADE)
        self.stack.add_named(page, "pick")
        self.stack.add_named(box, "code")
        tv = Adw.ToolbarView(content=self.stack)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.connect("closed", lambda *_: self._hide())

    def _show(self) -> None:
        picked = [cid for cid, row in self.rows.items() if row.get_active()]
        entries = pairing.saved(picked, self.passwords.get_active())
        keyed = [e for e in entries if self.sessions[e.cluster].cfg.key_login]
        self._say("Pick a login first" if not entries else "Adding a key for the phone" if keyed else "",
                  busy=bool(keyed))
        self.stack.set_visible_child_name("code")
        if not entries:
            return
        if not keyed:
            self._ready(pairing.Code(entries))
            return
        threading.Thread(target=self._add_key, args=(entries, keyed), daemon=True).start()

    def _add_key(self, entries: list[pairing.Entry], keyed: list[pairing.Entry]) -> None:
        """On a thread: the new key on each cluster that takes keys, then the code."""
        seed = ssh_keys.new()
        for e in keyed:
            s = self.sessions[e.cluster]
            try:
                res = s.ssh.run(ssh_keys.authorize_command(ssh_keys.public_line(seed))) if s.connected else None
                failed = "not connected" if res is None else res.stderr.strip() if res.returncode else ""
            except Exception as err:  # noqa: BLE001 - shown in the dialog
                failed = str(err)
            if failed:
                GLib.idle_add(self._say, f"Could not add the key to {s.cfg.name}", failed)
                return
            e.key = True
        GLib.idle_add(self._ready, pairing.Code(entries, seed))

    def _say(self, title: str, text: str = "", busy: bool = False) -> bool:
        self.spinner.set_visible(busy)
        self.title.set_label(title)
        self.text.set_label(text)
        self.squares = []
        self.area.queue_draw()
        return False

    def _ready(self, c: pairing.Code) -> bool:
        if self.stack.get_visible_child_name() != "code":
            return False  # hidden meanwhile
        squares = pairing.matrix(pairing.code(c))
        self._say("Scan it with the phone")
        self.squares = squares
        side = len(squares) * MODULE
        self.area.set_content_width(side)
        self.area.set_content_height(side)
        self.left = SHOWN
        self._tick()
        self.timer = GLib.timeout_add_seconds(1, self._tick)
        return False

    def _tick(self) -> bool:
        if self.left <= 0:
            self.timer = 0  # ends by returning False
            self._hide()
            return False
        self.text.set_label(f"In HPC Hub on the phone, tap QR code on a cluster. Hides in {self.left} s.")
        self.left -= 1
        return True

    def _hide(self) -> None:
        if self.timer:
            GLib.source_remove(self.timer)
            self.timer = 0
        self.squares = []
        self.area.queue_draw()
        self.stack.set_visible_child_name("pick")

    def _draw(self, _area, cr, _w, _h) -> None:
        if not self.squares:
            return
        cr.set_source_rgb(1, 1, 1)  # dark on light in any theme, or cameras miss it
        cr.paint()
        cr.set_source_rgb(0, 0, 0)
        for y, line in enumerate(self.squares):
            for x, dark in enumerate(line):
                if dark:
                    cr.rectangle(x * MODULE, y * MODULE, MODULE, MODULE)
        cr.fill()
