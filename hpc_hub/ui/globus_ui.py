"""Globus tab: browse collections, send transfers, watch tasks. Plus settings and sign-in."""

import posixpath
from collections.abc import Callable

import gi

gi.require_version("WebKit", "6.0")
from gi.repository import Adw, Gio, GLib, GObject, Gtk, Pango, WebKit  # noqa: E402

from .. import globus  # noqa: E402
from ..config import AppSettings, ClusterConfig  # noqa: E402
from .widgets import bg  # noqa: E402

POLL_SECONDS = 10
ACTIVE = ("ACTIVE", "INACTIVE")
HELP = ("Register a free app at app.globus.org → Settings → Developers → "
        "“Register a thick client or script that will be installed and run by users on their devices”. "
        "Paste its Client ID here.")


def _or_consent(work: Callable[[], object]) -> Callable[[], object]:
    """Return a ConsentRequired instead of raising it, so done() can spot it."""
    def run():
        try:
            return work()
        except globus.ConsentRequired as e:
            return e
    return run


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


class ItemObj(GObject.Object):
    def __init__(self, item: globus.Item):
        super().__init__()
        self.item = item


class GlobusPane(Gtk.Box):
    """One side: a cluster's Globus collection, browsed through Globus (no SSH or VPN needed)."""

    def __init__(self, page: "GlobusPage", index: int):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        self.page = page
        self.path = ""
        self.paths: dict[str, str] = {}
        self.other: GlobusPane | None = None
        self._empty = None

        top = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=8, margin_end=8)
        self.cluster = Gtk.DropDown.new_from_strings([c.name for c in page.clusters])
        self.cluster.set_selected(index)
        self.location = Gtk.Entry(hexpand=True, placeholder_text="/path", width_chars=8)
        top.append(self.cluster)
        top.append(self.location)
        nav = Gtk.Box(spacing=4, margin_start=8, margin_end=8, margin_bottom=6)
        for icon, tip, fn in (("go-up-symbolic", "Up", self.go_up), ("go-home-symbolic", "Home", lambda: self.go("")),
                              ("view-refresh-symbolic", "Refresh", lambda: self.go(self.path)),
                              ("folder-new-symbolic", "New folder", self.new_folder)):
            b = Gtk.Button(icon_name=icon, tooltip_text=tip, css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: f())
            nav.append(b)
        self.count = Gtk.Label(hexpand=True, xalign=1, css_classes=["dim-label", "caption"])
        nav.append(self.count)
        self.append(top)
        self.append(nav)

        self.store = Gio.ListStore(item_type=ItemObj)
        self.selection = Gtk.SingleSelection(model=self.store, autoselect=False, can_unselect=True)
        view = Gtk.ColumnView(model=self.selection, show_row_separators=False, css_classes=["data-table"])
        for title, attr, expand in (("Name", "name", True), ("Size", "size", False), ("Modified", "modified", False)):
            f = Gtk.SignalListItemFactory()
            f.connect("setup", self._setup, attr)
            f.connect("bind", self._bind, attr)
            view.append_column(Gtk.ColumnViewColumn(title=title, factory=f, expand=expand, resizable=True))
        view.connect("activate", lambda _v, pos: self._open(self.store.get_item(pos).item))

        self.empty = Adw.StatusPage(icon_name="folder-symbolic")
        self.empty_btn = Gtk.Button(halign=Gtk.Align.CENTER, css_classes=["pill", "suggested-action"])
        self.empty_btn.connect("clicked", lambda *_: self._empty_action())
        self.empty.set_child(self.empty_btn)
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(Gtk.ScrolledWindow(child=view), "list")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)

        self.send = Gtk.Button(child=Adw.ButtonContent(label="Transfer", icon_name="document-send-symbolic"),
                               halign=Gtk.Align.END, margin_top=6, margin_bottom=6, margin_start=8, margin_end=8)
        self.send.connect("clicked", lambda *_: page.transfer(self))
        self.append(self.send)

        self.cluster.connect("notify::selected", lambda *_: self.go(self.paths.get(self.cfg.id, "")))
        self.location.connect("activate", lambda *_: self.go(self.location.get_text().strip()))
        self.selection.connect("notify::selected-item", lambda *_: self._sync())
        self._sync()

    def _setup(self, _f, li, attr):
        if attr == "name":
            box = Gtk.Box(spacing=8)
            box.append(Gtk.Image())
            box.append(Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.MIDDLE))
            li.set_child(box)
        else:
            li.set_child(Gtk.Label(xalign=1 if attr == "size" else 0, css_classes=["dim-label", "numeric"]))

    def _bind(self, _f, li, attr):
        it: globus.Item = li.get_item().item
        if attr == "name":
            box = li.get_child()
            box.get_first_child().set_from_icon_name("folder-symbolic" if it.is_dir else "text-x-generic-symbolic")
            box.get_last_child().set_label(it.name)
        elif attr == "size":
            li.get_child().set_label("" if it.is_dir else GLib.format_size(it.size))
        else:
            li.get_child().set_label(it.modified)

    @property
    def cfg(self) -> ClusterConfig:
        return self.page.clusters[self.cluster.get_selected()]

    def selected(self) -> globus.Item | None:
        obj = self.selection.get_selected_item()
        return obj.item if obj else None

    def _sync(self) -> None:
        is_left = self.page.left is self if hasattr(self.page, "left") else True
        self.send.get_child().set_label("Transfer →" if is_left else "← Transfer")
        self.send.set_sensitive(self.selected() is not None)

    def _show_empty(self, title: str, text: str = "", icon: str = "folder-symbolic", button: str = "",
                    action=None) -> None:
        self.store.remove_all()
        self.empty.set_title(title)
        self.empty.set_description(GLib.markup_escape_text(text))
        self.empty.set_icon_name(icon)
        self.empty_btn.set_label(button)
        self.empty_btn.set_visible(bool(button))
        self._empty = action
        self.count.set_label("")
        self.stack.set_visible_child_name("empty")
        self._sync()

    def _empty_action(self) -> None:
        if self._empty:
            self._empty()

    def go(self, path: str) -> None:
        cfg, client = self.cfg, self.page.client
        if not client:
            return
        if not cfg.globus.collection_id:
            self._show_empty(f"No collection for {cfg.name}", "Pick the Globus collection that holds its files.",
                             "folder-remote-symbolic", "Choose collection", lambda: self.page.pick(cfg))
            return
        self.location.set_text(path)
        self.count.set_label("Loading…")

        def done(result, err):
            if cfg is not self.cfg:
                return
            if isinstance(result, globus.ConsentRequired):
                self._show_empty("Globus needs your permission", f"Allow HPC Hub to use {cfg.globus.collection_name}.",
                                 "dialog-password-symbolic", "Allow", self.page.consent)
                return
            if err:
                if self.path and path != self.path:
                    self.page.toast(f"{cfg.name}: {err}")
                    self.location.set_text(self.path)
                    self.count.set_label("")
                else:
                    self._show_empty("Could not open folder", err, "dialog-error-symbolic", "Try again",
                                     lambda: self.go(path))
                return
            target, items = result
            self.path = self.paths[cfg.id] = target
            self.location.set_text(target)
            self.store.splice(0, self.store.get_n_items(), [ItemObj(i) for i in items])
            self.count.set_label(f"{len(items)} items")
            if items:
                self.stack.set_visible_child_name("list")
            else:
                self._show_empty("Empty folder")
                self.count.set_label("0 items")
            self._sync()

        bg(_or_consent(lambda: client.ls(cfg.globus.collection_id, path)), done)

    def go_up(self) -> None:
        if self.path:
            self.go(posixpath.dirname(self.path.rstrip("/")) or "/")

    def _open(self, it: globus.Item) -> None:
        if it.is_dir:
            self.go(posixpath.join(self.path, it.name))

    def new_folder(self) -> None:
        cfg, client = self.cfg, self.page.client
        if not (client and cfg.globus.collection_id and self.path):
            return
        d = Adw.AlertDialog(heading="New folder")
        entry = Gtk.Entry(activates_default=True)
        d.set_extra_child(entry)
        d.add_response("cancel", "Cancel")
        d.add_response("ok", "Create")
        d.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        d.set_default_response("ok")

        def on_response(_d, r):
            name = entry.get_text().strip()
            if r != "ok" or not name or "/" in name:
                return
            bg(lambda: client.mkdir(cfg.globus.collection_id, posixpath.join(self.path, name)),
               lambda _r, err: (self.page.toast(f"Failed: {err}") if err else self.go(self.path)))
        d.connect("response", on_response)
        d.present(self.get_root())


class TaskRow(Adw.ActionRow):
    def __init__(self, t: dict, on_cancel):
        status = t.get("status", "")
        files = f"{t.get('files_transferred', 0)}/{t.get('files', 0)} files"
        nice = (t.get("nice_status") or status).replace("_", " ").lower() if status in ACTIVE else status.lower()
        when = (t.get("request_time") or "")[:16].replace("T", " ")
        super().__init__(
            title=GLib.markup_escape_text(t.get("label") or t.get("task_id", "")),
            subtitle=GLib.markup_escape_text(
                f"{t.get('source_endpoint_display_name', '?')} → {t.get('destination_endpoint_display_name', '?')}\n"
                f"{nice} · {GLib.format_size(int(t.get('bytes_transferred') or 0))} · {files} · {when}"),
            subtitle_lines=2)
        icon = {"SUCCEEDED": "emblem-ok-symbolic", "FAILED": "dialog-error-symbolic"}.get(status, "content-loading-symbolic")
        self.add_prefix(Gtk.Image(icon_name=icon))
        if status in ACTIVE:
            stop = Gtk.Button(icon_name="process-stop-symbolic", tooltip_text="Cancel transfer",
                              valign=Gtk.Align.CENTER, css_classes=["flat"])
            stop.connect("clicked", lambda *_: on_cancel(t["task_id"]))
            self.add_suffix(stop)


class GlobusPage(Gtk.Box):
    def __init__(self, app: AppSettings, clusters: list[ClusterConfig], save_app, save_clusters, toast):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.app, self.clusters, self.save_app, self.save_clusters, self.toast = (
            app, clusters, save_app, save_clusters, toast)
        self.client: globus.Globus | None = None
        self.poll_id = 0
        self._seen_active: set[str] = set()
        self._setup = self.settings

        self.setup = Adw.StatusPage(icon_name="network-transmit-receive-symbolic", vexpand=True)
        self.setup_btn = Gtk.Button(halign=Gtk.Align.CENTER, css_classes=["pill", "suggested-action"])
        self.setup_btn.connect("clicked", lambda *_: self._setup_action())
        self.setup.set_child(self.setup_btn)

        main = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        bar = Gtk.Box(spacing=8, margin_top=6, margin_start=12, margin_end=8)
        bar.append(Gtk.Label(label="Copies run on Globus, so you can close the app or your laptop.",
                             xalign=0, hexpand=True, wrap=True, css_classes=["dim-label", "caption"]))
        gear = Gtk.Button(icon_name="emblem-system-symbolic", tooltip_text="Globus settings", css_classes=["flat"])
        gear.connect("clicked", lambda *_: self.settings())
        bar.append(gear)
        main.append(bar)

        withcoll = [i for i, c in enumerate(clusters) if c.globus.collection_id] + list(range(len(clusters)))
        first = withcoll[0] if withcoll else 0
        second = next((i for i in withcoll if i != first), first)
        self.left = GlobusPane(self, first)
        self.right = GlobusPane(self, second)
        self.left.other, self.right.other = self.right, self.left
        self.left._sync()
        main.append(Gtk.Paned(start_child=self.left, end_child=self.right, vexpand=True, wide_handle=True,
                              resize_start_child=True, resize_end_child=True))

        head = Gtk.Box(spacing=8, margin_start=12, margin_end=8, margin_top=4)
        head.append(Gtk.Label(label="Recent transfers", xalign=0, hexpand=True, css_classes=["heading"]))
        again = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh", css_classes=["flat"])
        again.connect("clicked", lambda *_: self.refresh_tasks())
        head.append(again)
        main.append(head)
        self.tasks = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        self.tasks.set_placeholder(Gtk.Label(label="No transfers yet", margin_top=12, margin_bottom=12,
                                             css_classes=["dim-label"]))
        main.append(Gtk.ScrolledWindow(child=self.tasks, max_content_height=220, propagate_natural_height=True,
                                       margin_start=8, margin_end=8, margin_bottom=8, margin_top=4))

        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(self.setup, "setup")
        self.stack.add_named(main, "main")
        self.append(self.stack)
        self.connect("map", lambda *_: self.reload())
        self.connect("unmap", lambda *_: self._stop_poll())

    # -- account ------------------------------------------------------------------------
    def reload(self) -> None:
        cid = self.app.globus_client_id
        self.client = globus.Globus(cid) if cid else None
        if not self.client:
            self.setup.set_title("Set up Globus")
            self.setup.set_description(HELP)
            self.setup_btn.set_label("Open Globus settings")
            self._setup = self.settings
        elif not self.client.logged_in:
            self.setup.set_title("Sign in to Globus")
            self.setup.set_description("Use your university login. Globus then moves files between clusters for you.")
            self.setup_btn.set_label("Sign in")
            self._setup = self.consent
        else:
            self.stack.set_visible_child_name("main")
            for pane in (self.left, self.right):
                pane.go(pane.paths.get(pane.cfg.id, ""))
            self.refresh_tasks()
            self._start_poll()
            return
        self._stop_poll()
        self.stack.set_visible_child_name("setup")

    def _setup_action(self) -> None:
        self._setup()

    def settings(self) -> None:
        d = GlobusSettingsDialog(self.app, self.clusters, self.save_app, self.save_clusters)
        d.connect("closed", lambda *_: self.reload())
        d.present(self.get_root())

    def consent(self) -> None:
        """Sign in again, asking access to every chosen collection."""
        if not self.client:
            return
        scope = globus.data_access_scope([c.globus.collection_id for c in self.clusters])

        def done(err):
            self.toast(err or "Signed in to Globus")
            self.reload()
        LoginDialog(self.client, scope, done).present(self.get_root())

    def pick(self, cfg: ClusterConfig) -> None:
        def chosen(c: globus.Collection):
            cfg.globus.collection_id, cfg.globus.collection_name = c.id, c.name
            self.save_clusters()
            self.consent()  # new collection may need its own permission
        CollectionPicker(self.client, cfg, chosen).present(self.get_root())

    # -- transfers ------------------------------------------------------------------------
    def transfer(self, src: GlobusPane) -> None:
        dst, it, client = src.other, src.selected(), self.client
        if not (it and client and dst):
            return
        if not (dst.cfg.globus.collection_id and dst.path):
            self.toast("Open a folder on the other side first")
            return
        a, b = src.cfg, dst.cfg
        src_path, dst_path = posixpath.join(src.path, it.name), posixpath.join(dst.path, it.name)

        def done(task, err):
            if isinstance(task, globus.ConsentRequired):
                self.consent()
                return
            self.toast(f"Transfer failed: {err}" if err else f"Sent {it.name} to Globus")
            self.refresh_tasks()
        bg(_or_consent(lambda: client.submit(a.globus.collection_id, src_path, b.globus.collection_id, dst_path,
                                             f"HPC Hub {it.name}", it.is_dir)), done)

    def refresh_tasks(self) -> None:
        client = self.client
        if not (client and client.logged_in):
            return

        def done(tasks, err):
            if err:
                return
            while row := self.tasks.get_row_at_index(0):
                self.tasks.remove(row)
            for t in tasks:
                self.tasks.append(TaskRow(t, self.cancel))
            if any(t.get("status") == "SUCCEEDED" and t.get("task_id") in self._seen_active for t in tasks):
                for pane in (self.left, self.right):
                    pane.go(pane.path)
            self._seen_active = {t.get("task_id") for t in tasks if t.get("status") in ACTIVE}
        bg(client.tasks, done)

    def cancel(self, task_id: str) -> None:
        client = self.client
        bg(lambda: client.cancel(task_id),
           lambda _r, err: (self.toast(f"Cancel failed: {err}" if err else "Transfer cancelled"), self.refresh_tasks()))

    def _start_poll(self) -> None:
        if not self.poll_id:
            self.poll_id = GLib.timeout_add_seconds(POLL_SECONDS, lambda: (self.refresh_tasks(), True)[1])

    def _stop_poll(self) -> None:
        if self.poll_id:
            GLib.source_remove(self.poll_id)
            self.poll_id = 0
