"""Globus settings: client id, sign in or out, and each cluster's collection."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ... import globus
from ...config import AppSettings, ClusterConfig
from .dialogs import CollectionPicker, LoginDialog

HELP = ("Register a free app at app.globus.org → Settings → Developers → Register an app. Choose the one for "
        "\u201cnative applications that are distributed to users\u201d, name it HPC Hub, and add the redirect "
        "https://auth.globus.org/v2/web/auth-code. Paste its Client ID here.")


class GlobusSettingsDialog(Adw.PreferencesDialog):
    def __init__(self, app: AppSettings, clusters: list[ClusterConfig], save_app: Callable[[], None],
                 save_clusters: Callable[[], None]):
        super().__init__(title="Globus", search_enabled=False)
        self.app, self.clusters, self.save_app, self.save_clusters = app, clusters, save_app, save_clusters
        page = Adw.PreferencesPage()
        acct = Adw.PreferencesGroup(title="Account", description=HELP)
        self.client_row = Adw.EntryRow(title="Client ID", show_apply_button=True)
        self.client_row.set_text(app.globus_client_id)
        self.client_row.connect("apply", lambda *_: self._set_client())
        self.status = Adw.ActionRow(title="Status", css_classes=["property"])
        self.login_btn = Adw.ButtonRow()
        self.login_btn.connect("activated", lambda *_: self._toggle_login())
        for w in (self.client_row, self.status, self.login_btn):
            acct.add(w)
        page.add(acct)

        self.coll = Adw.PreferencesGroup(title="Collections",
                                         description="Pick the Globus collection that holds each cluster's files.")
        self.rows: dict[str, Adw.ActionRow] = {}
        for c in clusters:
            row = Adw.ActionRow(title=c.name)
            pick = Gtk.Button(label="Choose…", valign=Gtk.Align.CENTER)
            pick.connect("clicked", lambda *_, cfg=c: self._pick(cfg))
            row.add_suffix(pick)
            self.rows[c.id] = row
            self.coll.add(row)
        page.add(self.coll)
        self.add(page)
        self._sync()

    def client(self) -> globus.Globus:
        return globus.Globus(self.app.globus_client_id)

    def _sync(self) -> None:
        has_id = bool(self.app.globus_client_id)
        signed = has_id and self.client().logged_in
        self.status.set_subtitle("Signed in" if signed else "Not signed in")
        self.login_btn.set_title("Sign out" if signed else "Sign in to Globus")
        self.login_btn.set_sensitive(has_id)
        self.coll.set_sensitive(signed)
        for c in self.clusters:
            g = c.globus
            self.rows[c.id].set_subtitle(GLib.markup_escape_text(f"{g.collection_name} · {g.collection_id}")
                                         if g.collection_id else "Not set")

    def _set_client(self) -> None:
        self.app.globus_client_id = self.client_row.get_text().strip()
        self.save_app()
        self._sync()

    def _toggle_login(self) -> None:
        client = self.client()
        if client.logged_in:
            client.logout()
            self._sync()
            return
        def done(err):
            self.add_toast(Adw.Toast(title=err or "Signed in to Globus"))
            self._sync()
        LoginDialog(client, globus.TRANSFER_SCOPE, done).present(self)

    def _pick(self, cfg: ClusterConfig) -> None:
        def chosen(c: globus.Collection):
            cfg.globus.collection_id, cfg.globus.collection_name = c.id, c.name
            self.save_clusters()
            self._sync()
        CollectionPicker(self.client(), cfg, chosen).present(self)
