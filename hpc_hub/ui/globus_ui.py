"""Globus: settings, in-app sign-in, collection picker, and copy via Globus."""

import posixpath
import shlex
import threading
from collections.abc import Callable

import gi

gi.require_version("WebKit", "6.0")
from gi.repository import Adw, GLib, Gtk, WebKit  # noqa: E402

from .. import globus, transfer  # noqa: E402
from ..config import AppSettings, ClusterConfig  # noqa: E402
from ..session import ClusterSession  # noqa: E402

POLL_SECONDS = 5
HELP = ("Register a free app at app.globus.org → Settings → Developers → "
        "“Register a thick client or script that will be installed and run by users on their devices”. "
        "Paste its Client ID here.")


def _bg(work, done) -> None:
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


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
        _bg(lambda: self.client.finish_login(code, self.verifier), done)


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
        _bg(lambda: self.client.search(text), done)


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
        ids = [c.globus.collection_id for c in self.clusters]

        def done(err):
            self.add_toast(Adw.Toast(title=err or "Signed in to Globus"))
            self._sync()
        LoginDialog(client, globus.data_access_scope(ids), done).present(self)

    def _pick(self, cfg: ClusterConfig) -> None:
        def chosen(c: globus.Collection):
            cfg.globus.collection_id, cfg.globus.collection_name = c.id, c.name
            self.save_clusters()
            self._sync()
        CollectionPicker(self.client(), cfg, chosen).present(self)


class GlobusCopier:
    """Plugs into FilesPage.globus_copy: offer Globus when both clusters are set up."""

    def __init__(self, app: AppSettings, files_page, window: Gtk.Window):
        self.app, self.files, self.window = app, files_page, window

    def __call__(self, src: ClusterSession, src_path: str, dst: ClusterSession, dest_dir: str) -> bool:
        if not (self.app.globus_client_id and src.cfg.globus.collection_id and dst.cfg.globus.collection_id):
            return False
        client = globus.Globus(self.app.globus_client_id)
        if not client.logged_in:
            return False
        name = posixpath.basename(src_path.rstrip("/"))
        d = Adw.AlertDialog(heading=f"Copy {name}", body=f"{src.cfg.name} → {dst.cfg.name}:{dest_dir}")
        d.add_response("direct", "Direct")
        d.add_response("globus", "Globus")
        d.set_response_appearance("globus", Adw.ResponseAppearance.SUGGESTED)
        d.set_default_response("globus")
        d.set_close_response("direct")
        d.connect("response", lambda _d, r: self._globus(client, src, src_path, dst, dest_dir) if r == "globus"
                  else self.files.direct_copy(src, src_path, dst, dest_dir))
        d.present(self.window)
        return True

    def _globus(self, client, src, src_path, dst, dest_dir) -> None:
        from .files import TransferRow
        name = posixpath.basename(src_path.rstrip("/"))
        is_dir = not posixpath.splitext(name)[1]
        progress = transfer.Progress()
        row = TransferRow(f"Globus · {name}: {src.cfg.name} → {dst.cfg.name}:{dest_dir}", progress)
        self.files.transfers.prepend(row)
        self.files.revealer.set_reveal_child(True)
        row.update("Submitting to Globus…")

        def check_dir():
            res = src.ssh.run(f"test -d {shlex.quote(src_path)}", timeout=30)
            return res.returncode == 0

        def submit():
            recursive = check_dir() if src.ssh else is_dir
            dest = posixpath.join(dest_dir, name)
            return client.submit(src.cfg.globus.collection_id, src_path, dst.cfg.globus.collection_id, dest,
                                 f"HPC Hub {name}", recursive)

        def submitted(task_id, err):
            if err:
                row.progress.finished = True
                row.update(f"Failed: {err}")
                return
            progress.cancelled = _Cancel(client, task_id)  # the row's stop button now cancels at Globus
            GLib.timeout_add_seconds(POLL_SECONDS, lambda: self._poll(client, task_id, row))
            row.update("Queued at Globus")

        _bg(submit, submitted)

    def _poll(self, client, task_id, row) -> bool:
        def done(t, err):
            if err:
                row.update(f"Status unknown: {err}")
                return
            p = row.progress
            p.done = int(t.get("bytes_transferred") or 0)
            status = t.get("status", "")
            files = f"{t.get('files_transferred', 0)}/{t.get('files', 0)} files"
            if status in ("SUCCEEDED", "FAILED"):
                p.finished = True
                row.update(f"Globus {status.lower()} · {GLib.format_size(p.done)} · {files}")
                if status == "SUCCEEDED":
                    self.files.right.refresh()
                    self.files.left.refresh()
            else:
                row.update(f"Globus {t.get('nice_status') or status} · {GLib.format_size(p.done)} · {files}")
                GLib.timeout_add_seconds(POLL_SECONDS, lambda: self._poll(client, task_id, row))
        _bg(lambda: client.task(task_id), done)
        return False


class _Cancel(threading.Event):
    """progress.cancelled that also cancels the Globus task."""

    def __init__(self, client, task_id):
        super().__init__()
        self.client, self.task_id = client, task_id

    def set(self):
        super().set()
        threading.Thread(target=lambda: self.client.cancel(self.task_id), daemon=True).start()
