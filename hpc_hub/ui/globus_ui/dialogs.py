"""Globus sign-in (in the browser you pick) and the collection search."""

from collections.abc import Callable

from gi.repository import Adw, Gdk, GLib, Gtk

from ... import globus
from ...config import ClusterConfig
from ..widgets import bg, open_uri


def _step(n: int, title: str, subtitle: str = "") -> Adw.ActionRow:
    row = Adw.ActionRow(title=title, subtitle=subtitle, subtitle_lines=0)
    row.add_prefix(Gtk.Label(label=str(n), css_classes=["title-3", "accent"], width_chars=2))
    return row


class LoginDialog(Adw.Dialog):
    """Opens the Globus sign-in page in your browser; Globus then shows a code you paste here."""

    def __init__(self, client: globus.Globus, ids: list[str], on_done: Callable[[str], None], what: str = ""):
        """ids: collections to allow at the same time. Already signed in: only the Allow page, no login."""
        fresh = not client.logged_in
        super().__init__(title="Sign in to Globus" if fresh else "Allow Globus access", content_width=520,
                         content_height=520)
        self.client, self.on_done, self.finished, self.ids = client, on_done, False, ids
        self.verifier, challenge = globus.pkce()
        self.url = globus.authorize_url(client.client_id, challenge, globus.data_access_scope(ids), fresh)
        page = Adw.PreferencesPage()

        steps = Adw.PreferencesGroup()
        steps.add(_step(1, "Open the Globus page", "It asks which Chrome profile to use"))
        if fresh:
            steps.add(_step(2, "Sign in and click Allow",
                            "Pick your university or ACCESS CI, whichever your clusters use"))
        else:
            steps.add(_step(2, "Click Allow", f"Lets HPC Hub reach {what or 'your clusters'} through Globus. "
                            "One time for all of them; Globus remembers it"))
        steps.add(_step(3, "Copy the code Globus shows", "It fills in below when you come back here. Or paste it"))
        page.add(steps)

        go = Adw.PreferencesGroup()
        open_row = Adw.ButtonRow(title="Open Globus", start_icon_name="web-browser-symbolic")
        open_row.add_css_class("suggested-action")
        open_row.connect("activated", lambda *_: open_uri(self, self.url))
        go.add(open_row)
        page.add(go)

        paste = Adw.PreferencesGroup()
        self.code = Adw.EntryRow(title="Code from Globus")
        self.code.connect("entry-activated", lambda *_: self._finish())
        self.code.connect("changed", lambda *_: self.done.set_sensitive(bool(self._code())))
        paste.add(self.code)
        self.error = Gtk.Label(wrap=True, xalign=0, css_classes=["error"], margin_top=8, visible=False)
        paste.add(self.error)
        page.add(paste)

        cancel = Gtk.Button(label="Cancel")
        cancel.connect("clicked", lambda *_: self.close())
        self.done = Gtk.Button(label="Sign in" if fresh else "Done", css_classes=["suggested-action"], sensitive=False)
        self.done.connect("clicked", lambda *_: self._finish())
        bar = Adw.HeaderBar(show_end_title_buttons=False, show_start_title_buttons=False)
        bar.pack_start(cancel)
        bar.pack_end(self.done)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(bar)
        self.set_child(tv)
        self.connect("closed", lambda *_: self.finished or on_done("Sign-in cancelled"))
        self.connect("map", lambda *_: self._watch_focus())

    def _watch_focus(self) -> None:
        """Coming back from the browser with the code copied: fill it in."""
        win = self.get_root()
        if isinstance(win, Gtk.Window):
            hid = win.connect("notify::is-active", lambda w, _p: w.is_active() and not self._code()
                              and self._from_clipboard())
            self.connect("closed", lambda *_: win.disconnect(hid))

    def _from_clipboard(self) -> None:
        def got(clip, res):
            try:
                text = clip.read_text_finish(res) or ""
            except GLib.Error:
                return
            if globus.looks_like_code(text) and not self._code():
                self.code.set_text(text.strip())
        Gdk.Display.get_default().get_clipboard().read_text_async(None, got)

    def _code(self) -> str:
        """The code, also when the whole auth-code page address was pasted."""
        return globus.pasted_code(self.code.get_text())

    def _finish(self) -> None:
        code = self._code()
        if not code or self.finished:
            return
        self.done.set_sensitive(False)
        self.error.set_visible(False)

        def done(_r, err):
            if err:
                self.done.set_sensitive(True)
                self.error.set_label(f"Globus did not accept it: {err}. Codes work once; open the page again for a "
                                     "new one.")
                self.error.set_visible(True)
                return
            self.finished = True
            self.close()
            self.on_done("")
        bg(lambda: self.client.finish_login(code, self.verifier, self.ids), done)


class CollectionPicker(Adw.Dialog):
    def __init__(self, client: globus.Globus, cluster: ClusterConfig, on_pick: Callable[[globus.Collection], None]):
        super().__init__(title=f"Globus collection for {cluster.name}", content_width=560, content_height=620)
        self.client, self.on_pick, self.cluster = client, on_pick, cluster
        self.search = Gtk.SearchEntry(placeholder_text="Search, e.g. Expanse, Wulver, Bouchet", margin_top=8,
                                      margin_start=12, margin_end=12)
        self.results = Gtk.ListBox(css_classes=["boxed-list"], selection_mode=Gtk.SelectionMode.NONE,
                                   margin_start=12, margin_end=12, margin_bottom=12, margin_top=8)
        self.results.connect("row-activated", lambda _l, row: (self.on_pick(row.collection), self.close()))
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(self.search)
        box.append(Gtk.ScrolledWindow(child=self.results, vexpand=True))
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.search.connect("activate", lambda *_: self._run())
        self.search.connect("search-changed", lambda *_: len(self.search.get_text()) >= 3 and self._run())
        self.search.set_text((globus.cluster_words(cluster.name, cluster.host)[0] or [cluster.name])[0])

    def _run(self) -> None:
        text = self.search.get_text().strip()

        def done(found, err):
            if text != self.search.get_text().strip():
                return
            while row := self.results.get_row_at_index(0):
                self.results.remove(row)
            if err:
                self.results.append(Adw.ActionRow(title="Search failed", subtitle=GLib.markup_escape_text(err)))
                return
            words, domain = globus.cluster_words(self.cluster.name, self.cluster.host)
            top = globus.best(found, words, domain)
            for c in globus.ranked(found, words, domain):
                row = Adw.ActionRow(title=GLib.markup_escape_text(c.name),
                                    subtitle=GLib.markup_escape_text(f"{c.owner} · {c.id}"), activatable=True)
                if c is top:
                    row.add_suffix(Gtk.Label(label="Best match", css_classes=["accent"]))
                row.collection = c
                self.results.append(row)
            if not found:
                self.results.append(Adw.ActionRow(title="Nothing found", subtitle="Try another word"))
        bg(lambda: self.client.search(text) + self.client.search(text, mine=True), done)
