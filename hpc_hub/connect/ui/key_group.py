"""Login with an SSH key you paste on the cluster's key page (Yale), in the cluster's settings: three steps, only
the current one open (your key, add it on the key page, test the login; core/my_key.py). The desktop app's
KeyPanel.tsx does the same. Its words are in core/login_copy.py."""

import threading

from gi.repository import Adw, GLib, Gtk

from ...core import login_copy as C
from ...core import my_key
from ...core.config import ClusterConfig
from ...ui.widgets import open_uri

KEY, ADD, TEST = range(3)
RESULT_ICON = {"ok": ("emblem-ok-symbolic", "success"), "wait": ("hourglass-symbolic", "warning"),
               "error": ("dialog-warning-symbolic", "error")}


class Step:
    """An expander row with a number that turns into a check mark, and a one-line summary once it's done."""

    def __init__(self, n: int, title: str):
        self.row = Adw.ExpanderRow(title=title)
        self.mark = Gtk.Stack(valign=Gtk.Align.CENTER, width_request=24)
        self.mark.add_named(Gtk.Label(label=str(n), css_classes=["dim-label", "heading"]), "todo")
        self.mark.add_named(Gtk.Image(icon_name="object-select-symbolic", css_classes=["success"]), "done")
        self.row.add_prefix(self.mark)

    def show(self, state: str, summary: str = "") -> None:
        """state: "done", "open" or "later"."""
        self.mark.set_visible_child_name("done" if state == "done" else "todo")
        self.row.set_subtitle(GLib.markup_escape_text(summary) if state == "done" else "")
        self.row.set_expanded(state == "open")
        self.row.set_sensitive(state != "later")


def _button(label: str, *classes: str, icon: str = "") -> Gtk.Button:
    b = Gtk.Button(valign=Gtk.Align.CENTER, css_classes=list(classes))
    if icon:
        b.set_child(Adw.ButtonContent(label=label, icon_name=icon))
    else:
        b.set_label(label)
    return b


class KeyGroup(Adw.PreferencesGroup):
    """user and password are the dialog's rows: it saves them as usual."""

    def __init__(self, cfg: ClusterConfig, user: Adw.EntryRow, password: Adw.PasswordEntryRow, **kwargs):
        super().__init__(**kwargs)
        self.cfg, self.user, self.password = cfg, user, password
        self.key = my_key.find()
        self.added = bool(user.get_text().strip())  # set up before: start at the test
        help_link = Gtk.Button(label=C.WHATS_A_KEY, css_classes=["flat"], valign=Gtk.Align.CENTER,
                               tooltip_text=cfg.key_help_url)
        help_link.connect("clicked", lambda *_: open_uri(self, cfg.key_help_url))
        self.set_header_suffix(help_link)
        who = cfg.who

        self.steps = [Step(1, C.STEP_KEY), Step(2, C.STEP_ADD.format(who=who)), Step(3, C.STEP_TEST)]
        for s in self.steps:
            self.add(s.row)

        make = Adw.ActionRow(title=C.NO_KEY, title_lines=2)
        create = _button(C.CREATE_KEY, "suggested-action")
        create.connect("clicked", lambda *_: self._make())
        make.add_suffix(create)
        self.steps[KEY].row.add_row(make)

        self.copy_row = Adw.ActionRow(title=C.COPY_KEY, subtitle_lines=1)
        self.copy = _button("", "flat", icon="edit-copy-symbolic")
        self.copy.set_tooltip_text(C.COPY_KEY)
        self.copy.connect("clicked", lambda *_: self._copy())
        self.copy_row.add_suffix(self.copy)
        self.steps[ADD].row.add_row(self.copy_row)
        page = Adw.ActionRow(title=C.PASTE_IT.format(who=who), subtitle=GLib.markup_escape_text(cfg.key_page_note),
                             title_lines=2, subtitle_lines=3)
        open_page = _button(C.OPEN_PAGE.format(who=who), "suggested-action", icon="adw-external-link-symbolic")
        open_page.connect("clicked", lambda *_: open_uri(self, cfg.key_page))
        page.add_suffix(open_page)
        self.steps[ADD].row.add_row(page)
        added = Adw.ButtonRow(title=C.ADDED_IT)
        added.connect("activated", lambda *_: self._added())
        self.steps[ADD].row.add_row(added)

        user.set_title(cfg.username_label)
        user.connect("changed", lambda *_: self._show_result(None))
        self.steps[TEST].row.add_row(user)
        if cfg.second_factor == "duo":
            self.steps[TEST].row.add_row(Adw.ActionRow(subtitle=C.KEY_DUO.format(name=cfg.short_name)))
        test_row = Adw.ActionRow()
        self.spinner = Adw.Spinner(visible=False)
        self.test = _button(C.TEST_BUTTON, "suggested-action")
        self.test.connect("clicked", lambda *_: self._test())
        test_row.add_suffix(self.spinner)
        test_row.add_suffix(self.test)
        self.steps[TEST].row.add_row(test_row)
        self.result = Adw.ActionRow(visible=False, title_lines=3)
        self.result_icon = Gtk.Image()
        self.result.add_prefix(self.result_icon)
        self.steps[TEST].row.add_row(self.result)

        password.set_visible(False)
        if cfg.password_too:
            self.add(password)
            other = Adw.ButtonRow(title=C.USE_PASSWORD)
            other.connect("activated", lambda *_: self._password(other))
            self.add(other)
        self._show()

    def _show(self) -> None:
        k, who = self.key, self.cfg.who
        at = KEY if k is None else ADD if not self.added else TEST
        self.steps[KEY].show("open" if at == KEY else "done", C.HAVE_KEY.format(file=k.file) if k else "")
        self.steps[ADD].show("later" if at == KEY else "open" if at == ADD else "done", C.ADDED.format(who=who))
        self.steps[TEST].show("open" if at == TEST else "later")
        if k:
            self.copy_row.set_subtitle(f"<tt>{GLib.markup_escape_text(k.public)}</tt>")

    def _make(self) -> None:
        try:
            self.key = my_key.find() or my_key.create()
        except OSError as e:
            self.steps[KEY].row.set_subtitle(GLib.markup_escape_text(str(e)))
            return
        self._show()

    def _copy(self) -> None:
        self.get_clipboard().set(self.key.public)
        self.copy_row.set_title(C.COPIED)
        GLib.timeout_add_seconds(2, lambda: self.copy_row.set_title(C.COPY_KEY) or False)

    def _added(self) -> None:
        self.added = True
        self._show()
        self.user.grab_focus()

    def _test(self) -> None:
        name = self.user.get_text().strip()
        if not name:
            self._show_result(my_key.Result(False, C.TEST_NO_USER))
            return
        self.test.set_sensitive(False)
        self.spinner.set_visible(True)
        self._show_result(None)
        c, key = self.cfg, self.key

        def work():
            r = my_key.test(key, name, c.host, c.port, c.short_name, c.vpn_owner)
            GLib.idle_add(self._tested, r)
        threading.Thread(target=work, daemon=True).start()

    def _tested(self, r: my_key.Result) -> bool:
        self.test.set_sensitive(True)
        self.spinner.set_visible(False)
        self._show_result(r)
        return False

    def _show_result(self, r: my_key.Result | None) -> None:
        self.result.set_visible(r is not None)
        if r:
            icon, tone = RESULT_ICON[r.kind]
            self.result.set_title(GLib.markup_escape_text(r.text))
            self.result_icon.set_from_icon_name(icon)
            self.result_icon.set_css_classes([tone])

    def _password(self, row: Adw.ButtonRow) -> None:
        on = not self.password.get_visible()
        self.password.set_visible(on)
        row.set_title(C.USE_KEY if on else C.USE_PASSWORD)
