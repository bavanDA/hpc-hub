"""GlobusPage: two panes, the Transfer buttons between them, and recent transfers."""

import posixpath

from gi.repository import Adw, GLib, Gtk

from ... import globus, remote_fs
from ...config import AppSettings, ClusterConfig
from ...session import ClusterSession
from ..widgets import bg
from .dialogs import CollectionPicker, LoginDialog
from .pane import GlobusPane, or_consent
from .settings import HELP, GlobusSettingsDialog

POLL_SECONDS = 10
ACTIVE = ("ACTIVE", "INACTIVE")


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
    def __init__(self, app: AppSettings, clusters: list[ClusterConfig], save_app, save_clusters, toast,
                 sessions: dict[str, ClusterSession] | None = None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.app, self.clusters, self.save_app, self.save_clusters, self.toast = (
            app, clusters, save_app, save_clusters, toast)
        self.sessions = sessions or {}
        self._checked = False
        self.wants: dict[str, globus.NeedsSignIn] = {}  # cluster id: what its collection wants first
        self.client: globus.Globus | None = None
        self.poll_id = 0
        self._seen_active: set[str] = set()
        self._setup = self.settings

        self.setup = Adw.StatusPage(icon_name="network-transmit-receive-symbolic", vexpand=True)
        self.setup_btn = Gtk.Button(halign=Gtk.Align.CENTER, css_classes=["pill", "suggested-action"])
        self.setup_btn.connect("clicked", lambda *_: self._setup_action())
        self.setup.set_child(self.setup_btn)

        main = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.banner = Adw.Banner(revealed=False)
        self.banner.connect("button-clicked", lambda *_: self.consent())
        main.append(self.banner)
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
            self.check_collections()
            for pane in (self.left, self.right):
                pane.go(pane.paths.get(pane.cfg.id, ""))
            self.refresh_tasks()
            self._start_poll()
            return
        self._stop_poll()
        self.stack.set_visible_child_name("setup")

    def check_collections(self) -> None:
        """Find each cluster's collection, and replace saved ones that are not working collections. Once a run."""
        if self._checked:
            return
        self._checked = True
        client = self.client

        def done(changes, _err):
            for c in self.clusters:
                if c.id not in (changes or {}):
                    continue
                found, old = changes[c.id], c.globus.collection_id
                self._use(c, found)
                if not (found and found.id == old):
                    self.toast(f"{c.name} uses Globus collection {found.name}" if found else
                               f"No Globus collection found for {c.name}. Pick one")
            if changes:
                self.save_clusters()
                self.reload()
            self.check_access()
        bg(lambda: globus.check_collections(client, self.clusters), done)

    @staticmethod
    def _use(cfg: ClusterConfig, c: globus.Collection | None) -> None:
        cfg.globus.collection_id, cfg.globus.collection_name = (c.id, c.name) if c else ("", "")

    def check_access(self) -> None:
        """Ask each collection what it wants before it lists files, so one sign-in can cover all of them."""
        client, clusters = self.client, [c for c in self.clusters if c.globus.collection_id]

        def done(found, _err):
            self.wants = {cid: w for cid, w in (found or {}).items() if w}
            self._show_banner()
        bg(lambda: {c.id: client.needs(c.globus.collection_id) for c in clusters}, done)

    def need(self, cfg: ClusterConfig, want: globus.NeedsSignIn) -> None:
        self.wants[cfg.id] = want
        self._show_banner()

    def _names(self, kind) -> list[str]:
        return [c.name for c in self.clusters if isinstance(self.wants.get(c.id), kind)]

    def _domain(self) -> str:
        return next((w.domains[0] for w in self.wants.values() if isinstance(w, globus.SessionRequired)), "")

    def _show_banner(self) -> None:
        allow, domain = self._names(globus.ConsentRequired), self._domain()
        if domain:
            self.banner.set_title(f"{' and '.join(self._names(globus.SessionRequired))} wants you signed in with "
                                  f"your {domain} account" + (f". {' and '.join(allow)} also needs your OK"
                                                              if allow else ""))
            self.banner.set_button_label("Sign in")
        elif allow:
            self.banner.set_title(f"Globus needs your OK to use {' and '.join(allow)}. One time")
            self.banner.set_button_label("Allow")
        self.banner.set_revealed(bool(allow or domain))

    def start_personal(self, cfg: ClusterConfig) -> None:
        """Your own collection (Wulver): start Globus Connect Personal on the login node."""
        s = self.sessions.get(cfg.id)
        if not (s and s.connected):
            self.toast(f"Connect to {cfg.name} first")
            return
        self.toast(f"Starting Globus Connect on {cfg.name}…")

        def start():
            folders = [p.path for p in remote_fs.storage(remote_fs.places(s.ssh)) if p.label != "Home"]
            res = s.ssh.run(globus.personal_start(folders), timeout=90)
            if res.returncode != 0:
                raise RuntimeError(res.stderr.strip() or "Could not start it")

        def done(_r, err):
            self.toast(f"Could not start Globus Connect: {err}" if err else f"Globus Connect is running on {cfg.name}")
            for pane in (self.left, self.right):
                if pane.cfg is cfg:
                    pane.go(pane.paths.get(cfg.id, ""))
        bg(start, done)

    def _setup_action(self) -> None:
        self._setup()

    def settings(self) -> None:
        d = GlobusSettingsDialog(self.app, self.clusters, self.save_app, self.save_clusters)
        d.connect("closed", lambda *_: self.reload())
        d.present(self.get_root())

    def consent(self) -> None:
        """Sign in, or only Allow when signed in already: access to every cluster's collection at once."""
        if not self.client:
            return
        domain = self._domain()
        scope = globus.merge_scopes([s for w in self.wants.values() if isinstance(w, globus.ConsentRequired)
                                     for s in w.scopes])
        what = " and ".join(self._names(globus.SessionRequired) if domain else self._names(globus.ConsentRequired))

        def done(err):
            self.toast(err or "Globus is ready")
            if not err:
                self.wants.clear()
                self.banner.set_revealed(False)
                self.check_access()  # anything left (a second domain) shows again
            self.reload()
        LoginDialog(self.client, scope, done, what, domain).present(self.get_root())

    def pick(self, cfg: ClusterConfig) -> None:
        def chosen(c: globus.Collection):
            self._use(cfg, c)
            self.save_clusters()
            self.check_access()  # the new one may want its own Allow
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
            if isinstance(task, globus.NeedsSignIn):
                self.toast(str(task))
                self.check_access()
                return
            self.toast(f"Transfer failed: {err}" if err else f"Sent {it.name} to Globus")
            self.refresh_tasks()
        bg(or_consent(lambda: client.submit(a.globus.collection_id, src_path, b.globus.collection_id, dst_path,
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
