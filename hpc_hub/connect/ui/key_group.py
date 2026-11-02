"""Sign-in with an SSH key you paste on the cluster's key page (Yale), in the cluster's settings: three steps, only
the current one open (a key, yours or one HPC Hub makes; send it to the cluster; try it; core/my_key.py). The
desktop app's KeyPanel.tsx does the same. Its words are in core/login_copy.py."""

import threading
from pathlib import Path

from gi.repository import Adw, Gio, GLib, Gtk

from ...core import login_copy as C
from ...core import my_key
from ...core.config import ClusterConfig
from ...ui.widgets import open_uri

KEY, ADD, TEST = range(3)
RESULT_ICON = {"ok": ("emblem-ok-symbolic", "success"), "wait": ("hourglass-symbolic", "warning"),
               "error": ("dialog-warning-symbolic", "error")}


def _button(label: str, *classes: str, icon: str = "") -> Gtk.Button:
    b = Gtk.Button(valign=Gtk.Align.CENTER, css_classes=list(classes))
    if icon:
        b.set_child(Adw.ButtonContent(label=label, icon_name=icon))
    else:
        b.set_label(label)
    return b


class Step:
    """A plain row with a number that turns into a check mark, a one-line summary once done, and the rows below it
    that show only while it is the current step."""

    def __init__(self, n: int, title: str, done_title: str = ""):
        self.title, self.done_title = title, done_title or title
        self.row = Adw.ActionRow(title=title)
        self.mark = Gtk.Stack(valign=Gtk.Align.CENTER, width_request=24)
        self.mark.add_named(Gtk.Label(label=str(n), css_classes=["heading"]), "todo")
        self.mark.add_named(Gtk.Image(icon_name="object-select-symbolic", css_classes=["success"]), "done")
        self.row.add_prefix(self.mark)
        self.body: list[Gtk.Widget] = []

    def show(self, state: str, summary: str = "") -> None:
        """state: "done", "open" or "later"."""
        done = state == "done"
        self.mark.set_visible_child_name("done" if done else "todo")
        self.row.set_title(self.done_title if done else self.title)
        self.row.set_subtitle(GLib.markup_escape_text(summary) if done else "")
        self.row.set_sensitive(state != "later")
        self.row.set_css_classes(["heading"] if state == "open" else [])
        for w in self.body:
            w.set_visible(state == "open")


class KeyGroup(Adw.PreferencesGroup):
    """user and password are the dialog's rows: it saves them as usual."""

    def __init__(self, cfg: ClusterConfig, user: Adw.EntryRow, password: Adw.PasswordEntryRow, **kwargs):
        super().__init__(**kwargs)
        self.cfg, self.user, self.password = cfg, user, password
        self.key = my_key.find(cfg.ssh_key)
        self.how = "found"  # found, made or picked: what step 1 says
        self.added = bool(self.key and user.get_text().strip())  # a key and a username from before: at the test
        self.works = False
        self.testing = self.tested = False
        help_link = _button(C.WHATS_A_KEY, "flat", "accent", icon="adw-external-link-symbolic")
        help_link.set_tooltip_text(cfg.key_help_url)
        help_link.connect("clicked", lambda *_: open_uri(self, cfg.key_help_url))
        self.set_header_suffix(help_link)
        who = cfg.who

        self.steps = [Step(1, C.STEP_KEY, C.STEP_KEY_DONE), Step(2, C.STEP_ADD.format(who=who)),
                      Step(3, C.STEP_TEST)]

        create = _button(C.CREATE_KEY, "suggested-action")
        create.connect("clicked", lambda *_: self._make())
        mine = _button(C.USE_MINE, "flat", icon="document-open-symbolic")
        mine.connect("clicked", lambda *_: self._pick())
        self.steps[KEY].row.add_suffix(mine)
        self.steps[KEY].row.add_suffix(create)
        self.steps[KEY].body = [create]
        self.mine = mine

        self.copy_row = Adw.ActionRow(title_lines=1)
        self.copy = _button(C.COPY_KEY, "flat", icon="edit-copy-symbolic")
        self.copy.connect("clicked", lambda *_: self._copy())
        self.copy_row.add_suffix(self.copy)
        page = Adw.ActionRow(title=C.PASTE_IT.format(who=who), subtitle=GLib.markup_escape_text(cfg.key_page_note),
                             title_lines=2, subtitle_lines=3)
        added = _button(C.PASTED_IT, "flat")
        added.connect("clicked", lambda *_: self._added())
        open_page = _button(C.OPEN_PAGE, "suggested-action", icon="adw-external-link-symbolic")
        open_page.connect("clicked", lambda *_: open_uri(self, cfg.key_page))
        page.add_suffix(added)
        page.add_suffix(open_page)
        change = _button(C.CHANGE, "flat", "accent")
        change.connect("clicked", lambda *_: self._change())
        self.steps[ADD].row.add_suffix(change)
        self.change = change
        self.steps[ADD].body = [self.copy_row, page]

        user.set_title(cfg.username_label)
        user.connect("changed", lambda *_: self._show_result(None))
        self.spinner = Adw.Spinner(visible=False)
        self.test = _button(C.TRY, "suggested-action")
        self.test.connect("clicked", lambda *_: self._test())
        user.add_suffix(self.spinner)
        user.add_suffix(self.test)
        self.duo = Adw.ActionRow(subtitle=C.DUO_NOW, visible=False)
        self.result = Adw.ActionRow(visible=False, title_lines=3)
        self.result_icon = Gtk.Image()
        self.result.add_prefix(self.result_icon)
        self.steps[TEST].body = [user, self.duo, self.result]

        for s in self.steps:
            self.add(s.row)
            for w in s.body:
                if isinstance(w, Gtk.ListBoxRow):
                    self.add(w)

        password.set_visible(False)
        if cfg.password_too:
            self.add(password)
            other = Adw.ButtonRow(title=C.USE_PASSWORD)
            other.connect("activated", lambda *_: self._password(other))
            self.add(other)
        self._show()

    def _show(self) -> None:
        k = self.key
        at = KEY if k is None else ADD if not self.added else TEST
        file = k.file if k else ""
        said = {"made": C.KEY_MADE, "picked": C.KEY_PICKED}.get(self.how, C.KEY_FOUND)
        self.steps[KEY].show("open" if at == KEY else "done", said.format(file=file))
        if at == KEY:
            self.mine.set_child(Adw.ButtonContent(label=C.USE_MINE, icon_name="document-open-symbolic"))
            self.mine.set_css_classes(["flat"])
        else:  # done: picking another key is a quiet Change, like step 2's
            self.mine.set_label(C.CHANGE)
            self.mine.set_css_classes(["flat", "accent"])
        self.steps[ADD].show("later" if at == KEY else "open" if at == ADD else "done", C.PASTED)
        self.change.set_visible(at == TEST)
        self.steps[TEST].show("done" if self.works else "open" if at == TEST else "later",
                              C.SIGNED_IN_AS.format(user=self.user.get_text().strip()))
        if self.works:
            self.user.set_visible(True)  # still editable, and the result says you're in
        # these two show only while a test runs or after one, not just because the step is open
        self.duo.set_visible(self.testing and self.cfg.second_factor == "duo")
        self.result.set_visible(self.tested)
        if k:
            self.copy_row.set_title(f"<tt>{GLib.markup_escape_text(k.public)}</tt>")

    def _make(self) -> None:
        try:
            self.key = my_key.find() or my_key.create()
        except OSError as e:
            self.steps[KEY].row.set_subtitle(GLib.markup_escape_text(str(e)))
            return
        self.how = "made"
        self._show()

    def _pick(self) -> None:
        """A key you already have: the file dialog, starting in ~/.ssh."""
        dialog = Gtk.FileDialog(title=C.PICK_KEY, initial_folder=Gio.File.new_for_path(str(Path.home() / ".ssh")))

        def done(d, result):
            try:
                f = d.open_finish(result)
            except GLib.Error:
                return  # closed without picking
            try:
                self.key = my_key.load(f.get_path())
            except (ValueError, OSError) as e:
                self.steps[KEY].row.set_subtitle(GLib.markup_escape_text(str(e)))
                return
            self.cfg.ssh_key = self.key.path  # saved with the rest of the settings
            self.how = "picked"
            self._show_result(None)
            self._show()
        dialog.open(self.get_root(), None, done)

    def _copy(self) -> None:
        self.get_clipboard().set(self.key.public)
        self.copy.set_child(Adw.ButtonContent(label=C.COPIED, icon_name="object-select-symbolic"))
        GLib.timeout_add_seconds(2, lambda: self.copy.set_child(
            Adw.ButtonContent(label=C.COPY_KEY, icon_name="edit-copy-symbolic")) or False)

    def _added(self) -> None:
        self.added = True
        self._show()
        self.user.grab_focus()

    def _change(self) -> None:
        self.added, self.works = False, False
        self._show_result(None)
        self._show()

    def _test(self) -> None:
        name = self.user.get_text().strip()
        if not name or not self.key:
            return
        self.test.set_sensitive(False)
        self.spinner.set_visible(True)
        self.testing = True
        self._show_result(None)
        self.duo.set_visible(self.cfg.second_factor == "duo")
        c, key = self.cfg, self.key

        def work():
            r = my_key.test(key, name, c.host, c.port, c.who, c.vpn.enabled)
            GLib.idle_add(self._tested, r)
        threading.Thread(target=work, daemon=True).start()

    def _tested(self, r: my_key.Result) -> bool:
        self.test.set_sensitive(True)
        self.spinner.set_visible(False)
        self.testing = False
        self.test.set_label(C.TRY if r.ok else C.TRY_AGAIN)
        self._show_result(r)
        self.works = r.ok
        self._show()
        return False

    def _show_result(self, r: my_key.Result | None) -> None:
        self.tested = r is not None
        self.result.set_visible(self.tested)
        if r is None:
            self.works = False
        else:
            icon, tone = RESULT_ICON[r.kind]
            self.result.set_title(GLib.markup_escape_text(r.text))
            self.result_icon.set_from_icon_name(icon)
            self.result_icon.set_css_classes([tone])

    def _password(self, row: Adw.ButtonRow) -> None:
        on = not self.password.get_visible()
        self.password.set_visible(on)
        row.set_title(C.USE_KEY if on else C.USE_PASSWORD)
