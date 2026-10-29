"""Set up the phone app: your logins as a QR code (core/pairing.py) the phone scans. Shown only on a click, and
hidden again after SHOWN seconds, since anyone who sees the code sees the passwords in it."""

from gi.repository import Adw, GLib, Gtk

from ...core import credentials, pairing
from ...core.config import ClusterConfig

SHOWN = 60
MODULE = 6  # pixels per QR square


def matrix(text: str) -> list[list[bool]] | None:
    """The QR squares with a quiet border, or None without python3-qrcode."""
    try:
        import qrcode
    except ImportError:
        return None
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
    qr.add_data(text)
    qr.make(fit=True)
    return qr.get_matrix()


class PhonePairDialog(Adw.Dialog):
    def __init__(self, clusters: list[ClusterConfig]):
        super().__init__(title="Set up the phone app", content_width=460)
        self.rows: dict[str, Adw.SwitchRow] = {}
        self.left = 0
        self.timer = 0
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(title="Logins", description="Each login you pick goes to HPC Hub on your phone. "
                                     "Duo still asks when the phone connects.")
        for c in clusters:
            saved = credentials.load(c.id, credentials.SSH)
            if saved and saved.username:
                row = Adw.SwitchRow(title=c.name, active=True, subtitle=GLib.markup_escape_text(
                    saved.username + (", password saved" if saved.password else "")))
                self.rows[c.id] = row
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
        self.title = Gtk.Label(css_classes=["title-2"], wrap=True, justify=Gtk.Justification.CENTER)
        self.text = Gtk.Label(wrap=True, justify=Gtk.Justification.CENTER, css_classes=["dim-label"])
        hide = Gtk.Button(label="Hide", css_classes=["pill"], halign=Gtk.Align.CENTER)
        hide.connect("clicked", lambda *_: self._hide())
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin_start=24, margin_end=24,
                      margin_top=12, margin_bottom=24)
        for w in (self.title, self.text, self.area, hide):
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
        text, has = pairing.code(picked, self.passwords.get_active())
        squares = matrix(text) if has else None
        if not has:
            self.title.set_label("Pick a login first")
            self.text.set_label("")
        elif squares is None:
            self.title.set_label("Install python3-qrcode")
            self.text.set_label("The QR code needs it: sudo dnf install python3-qrcode, then open this again.")
        self.squares = squares or []
        side = len(self.squares) * MODULE
        self.area.set_content_width(side)
        self.area.set_content_height(side)
        self.area.queue_draw()
        self.stack.set_visible_child_name("code")
        if self.squares:
            self.title.set_label("Scan it with the phone")
            self.left = SHOWN
            self._tick()
            self.timer = GLib.timeout_add_seconds(1, self._tick)

    def _tick(self) -> bool:
        if self.left <= 0:
            self.timer = 0  # ends by returning False
            self._hide()
            return False
        self.text.set_label(f"In HPC Hub on the phone: Clusters, then Scan from computer. "
                                    f"Hides in {self.left} s.")
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
