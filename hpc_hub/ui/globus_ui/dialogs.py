"""Globus sign-in (in a web view) and the collection search."""

from collections.abc import Callable

import gi

gi.require_version("WebKit", "6.0")
from gi.repository import Adw, GLib, Gtk, WebKit  # noqa: E402

from ... import globus  # noqa: E402
from ...config import ClusterConfig  # noqa: E402
from ..widgets import bg  # noqa: E402


class LoginDialog(Adw.Dialog):
    def __init__(self, client: globus.Globus, scope: str, on_done: Callable[[str], None]):
        super().__init__(title="Sign in to Globus", content_width=560, content_height=760)
        self.client, self.on_done, self.finished = client, on_done, False
        self.verifier, challenge = globus.pkce()
        self.web = WebKit.WebView(vexpand=True)
        self.web.connect("load-changed", self._loaded)
        tv = Adw.ToolbarView(content=self.web)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self.web.load_uri(globus.authorize_url(client.client_id, challenge, scope))
        self.connect("closed", lambda *_: self.finished or on_done("Sign-in cancelled"))

    def _loaded(self, web, event) -> None:
        code = globus.code_from_url(web.get_uri() or "")
        if not code or self.finished:
            return
        self.finished = True

        def done(_r, err):
            self.close()
            self.on_done(err)
        bg(lambda: self.client.finish_login(code, self.verifier), done)


class CollectionPicker(Adw.Dialog):
    def __init__(self, client: globus.Globus, cluster: ClusterConfig, on_pick: Callable[[globus.Collection], None]):
        super().__init__(title=f"Globus collection for {cluster.name}", content_width=560, content_height=620)
        self.client, self.on_pick = client, on_pick
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
        self.search.set_text(cluster.name.split()[0])

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
            for c in found:
                row = Adw.ActionRow(title=GLib.markup_escape_text(c.name),
                                    subtitle=GLib.markup_escape_text(f"{c.owner} · {c.id}"), activatable=True)
                row.collection = c
                self.results.append(row)
        bg(lambda: self.client.search(text), done)
