"""Login with an SSH key you paste on the cluster's key page (Yale), in the cluster's settings: make the key, copy
it, paste it there, then test it with your username (core/my_key.py). The desktop app's KeyPanel.tsx does the same.
Its words are in core/login_copy.py."""

import threading

from gi.repository import Adw, GLib, Gtk

from ...core import login_copy as C
from ...core import my_key
from ...core.config import ClusterConfig
from ...ui.widgets import open_uri


def _step(n: int, title: str, subtitle: str = "") -> tuple[Adw.ActionRow, Gtk.Stack]:
    """A numbered row; the number turns into a check mark once it's done."""
    row = Adw.ActionRow(title=title, subtitle=subtitle)
    mark = Gtk.Stack(valign=Gtk.Align.CENTER, width_request=24)
    mark.add_named(Gtk.Label(label=str(n), css_classes=["dim-label", "heading"]), "todo")
    mark.add_named(Gtk.Image(icon_name="object-select-symbolic", css_classes=["success"]), "done")
    row.add_prefix(mark)
    return row, mark


def _button(label: str, *classes: str) -> Gtk.Button:
    return Gtk.Button(label=label, valign=Gtk.Align.CENTER, css_classes=list(classes))


class KeyGroup(Adw.PreferencesGroup):
    """user and password are the dialog's rows: it saves them as usual."""

    def __init__(self, cfg: ClusterConfig, user: Adw.EntryRow, password: Adw.PasswordEntryRow, **kwargs):
        super().__init__(**kwargs)
        self.cfg, self.user, self.password = cfg, user, password
        self.key = my_key.find()

        explain = Adw.ExpanderRow(title=C.WHATS_A_KEY)
        text = Gtk.Label(label=C.KEY_EXPLAINED.format(who=cfg.who), wrap=True, xalign=0, margin_top=10,
                         margin_bottom=10, margin_start=12, margin_end=12, css_classes=["dim-label"])
        explain.add_row(text)
        self.add(explain)

        self.make_row, self.make_mark = _step(1, C.STEP_MAKE)
        self.make = _button(C.MAKE_BUTTON, "suggested-action")
        self.make.connect("clicked", lambda *_: self._make())
        self.make_row.add_suffix(self.make)
        self.add(self.make_row)

        self.copy_row, self.copy_mark = _step(2, C.STEP_COPY)
        self.copy_row.set_subtitle_lines(1)
        self.copy = _button(C.COPY_BUTTON)
        self.copy.connect("clicked", lambda *_: self._copy())
        self.copy_row.add_suffix(self.copy)
        self.add(self.copy_row)

        page_row, _ = _step(3, C.STEP_PASTE.format(who=cfg.who), GLib.markup_escape_text(cfg.key_page_note))
        open_page = _button(C.OPEN_PAGE)
        open_page.connect("clicked", lambda *_: open_uri(self, cfg.key_page))
        page_row.add_suffix(open_page)
        self.add(page_row)

        user.set_title(C.STEP_USER)
        self.test = _button(C.TEST_BUTTON, "flat")
        self.test.connect("clicked", lambda *_: self._test())
        user.add_suffix(self.test)
        user.connect("changed", lambda *_: self._show_result(None))
        self.add(user)
        self.result = Adw.ActionRow(visible=False)
        self.add(self.result)

        password.set_visible(False)
        if cfg.password_too:
            self.add(password)
            other = Adw.ButtonRow(title=C.USE_PASSWORD)
            other.connect("activated", lambda *_: self._password(other))
            self.add(other)
        self._show_key()

    def _show_key(self) -> None:
        k = self.key
        self.make.set_visible(k is None)
        self.make_mark.set_visible_child_name("done" if k else "todo")
        self.make_row.set_subtitle(C.HAVE_KEY.format(kind=k.kind, made=k.json()["made_on"]) if k else "")
        self.copy_row.set_subtitle(f"<tt>{GLib.markup_escape_text(k.public)}</tt>" if k else "")
        self.copy.set_sensitive(k is not None)
        self.test.set_sensitive(k is not None)

    def _make(self) -> None:
        try:
            self.key = my_key.find() or my_key.create()
        except OSError as e:
            self._show_result(my_key.Result(False, str(e)))
        self._show_key()

    def _copy(self) -> None:
        self.get_clipboard().set(self.key.public)
        self.copy.set_label(C.COPIED)
        self.copy_mark.set_visible_child_name("done")
        GLib.timeout_add_seconds(2, lambda: self.copy.set_label(C.COPY_BUTTON) or False)

    def _test(self) -> None:
        name = self.user.get_text().strip()
        if not name:
            self._show_result(my_key.Result(False, C.TEST_NO_USER))
            return
        self.test.set_sensitive(False)
        c, key = self.cfg, self.key

        def work():
            r = my_key.test(key, name, c.host, c.port, c.who, c.vpn.enabled)
            GLib.idle_add(lambda: (self._show_result(r), self.test.set_sensitive(True), False)[-1])
        threading.Thread(target=work, daemon=True).start()

    def _show_result(self, r: my_key.Result | None) -> None:
        self.result.set_visible(r is not None)
        if r:
            self.result.set_title(GLib.markup_escape_text(r.text))
            self.result.set_css_classes(["success" if r.ok else "error"])

    def _password(self, row: Adw.ButtonRow) -> None:
        on = not self.password.get_visible()
        self.password.set_visible(on)
        row.set_title(C.USE_KEY if on else C.USE_PASSWORD)

