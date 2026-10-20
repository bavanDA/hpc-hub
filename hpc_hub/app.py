"""Application: owns sessions, bridges worker threads to the GTK main loop."""

import threading

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gio, GLib, Gtk  # noqa: E402

from . import APP_ID, APP_NAME, __version__, browser, config, credentials  # noqa: E402
from .askpass_server import AskpassServer  # noqa: E402
from .paths import runtime_dir  # noqa: E402
from .projects import ProjectStore  # noqa: E402
from .session import ClusterSession, State  # noqa: E402
from .ui import style  # noqa: E402
from .ui.duo import DuoDialog  # noqa: E402
from .ui.globus_ui import GlobusPage  # noqa: E402
from .ui.preferences import PreferencesDialog  # noqa: E402
from .ui.projects import Actions, ProjectsPage  # noqa: E402
from .ui.quit import QuitMixin  # noqa: E402
from .ui.settings import ClusterSettingsDialog  # noqa: E402
from .ui.tools import Tools  # noqa: E402
from .ui.browser_login import BrowserLoginDialog  # noqa: E402
from .ui.web_login import WebLoginDialog  # noqa: E402
from .ui.window import MainWindow  # noqa: E402

HEALTH_SECONDS = 30


class HpcHubApp(QuitMixin, Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.window: MainWindow | None = None
        self.sessions: dict[str, ClusterSession] = {}
        self.askpass = AskpassServer()
        self._quitting = False
        self.duo_dialogs: dict[str, DuoDialog] = {}

    # -- lifecycle -----------------------------------------------------------------
    def do_startup(self):
        Adw.Application.do_startup(self)
        style.install()

        self.askpass.start()
        self.clusters = config.load()
        self.projects = ProjectStore()
        self.app_settings = config.load_app()
        browser.preferred = self.app_settings.browser_profile
        self.sessions = {c.id: ClusterSession(c, self.askpass, self) for c in self.clusters}
        for leftover in runtime_dir().glob("nm-*"):  # VPN cookie files from a killed run
            leftover.unlink(missing_ok=True)
        threading.Thread(target=self._adopt_all, daemon=True).start()

        for name, handler, accels in (
            ("quit", lambda *_: self._request_quit(), ["<primary>q"]),
            ("about", lambda *_: self._about(), []),
            ("disconnect-quit", lambda *_: self._disconnect_and_quit(), []),
            ("preferences", lambda *_: PreferencesDialog(
                self.app_settings, lambda: config.save_app(self.app_settings)).present(self.window), ["<primary>comma"]),
        ):
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", handler)
            self.add_action(action)
            if accels:
                self.set_accels_for_action(f"app.{name}", accels)
        GLib.timeout_add_seconds(HEALTH_SECONDS, self._health_check)
        self._watch_sleep()

    def _adopt_all(self) -> None:
        for s in self.sessions.values():
            login = credentials.load(s.cfg.id, credentials.SSH)
            try:
                s.adopt(login.username if login else "")
            except Exception:  # noqa: BLE001
                pass

    def do_activate(self):
        if not self.window:
            self.window = MainWindow(
                self, list(self.sessions.values()),
                self.connect_session, self.disconnect_session, self.open_settings, self.open_tool,
                lambda: config.save(self.clusters),
                lambda toast: GlobusPage(self.app_settings, self.clusters, lambda: config.save_app(self.app_settings),
                                         lambda: config.save(self.clusters), toast),
                lambda toast: ProjectsPage(list(self.sessions.values()), self.projects, toast, Actions(
                    vscode=lambda s, folder, target: self.tools.vscode(s, folder, target),
                    agent=lambda s, agent, folder: self.tools.agent(s, agent, folder),
                    files=self._open_files,
                    latex=self._open_latex_project,
                    connect=self.connect_session,
                    ask=lambda s, folder: self.tools.ask_all(s, folder))),
                self.projects)
            self.window.connect("close-request", self._on_close_request)
            self.window.terminals.on_tool = self.open_tool
            self.window.files.pane.on_tool = self._tool_in_folder
            self.window.schedules.on_open_folder = self._open_files
            self.tools = Tools(self.window, self.window.terminals,
                               lambda: self.window.stack.set_visible_child_name("terminals"),
                               self.window.toast, lambda: config.save(self.clusters))
            self.tools.open_files = self._open_files
        self.window.present()

    def do_shutdown(self):
        self.askpass.stop()
        Adw.Application.do_shutdown(self)

    # -- Listener (called from worker threads) --------------------------------------
    def state_changed(self, session: ClusterSession) -> None:
        GLib.idle_add(self._on_state, session)

    def log(self, session: ClusterSession, line: str) -> None:
        GLib.idle_add(self._on_log, session, line)

    def ask(self, session: ClusterSession, prompt: str) -> str | None:
        done = threading.Event()
        result: dict[str, str | None] = {"answer": None}
        GLib.idle_add(self._ask_dialog, session, prompt, result, done)
        done.wait()
        return result["answer"]

    def code(self, session: ClusterSession, prompt: str) -> str | None:
        done = threading.Event()
        result: dict[str, str | None] = {"answer": None}
        GLib.idle_add(self._code_dialog, session, result, done)
        done.wait()
        return result["answer"]

    def web_login(self, session: ClusterSession, start, login, in_browser: bool = False) -> tuple[str, str]:
        done = threading.Event()
        result = {"token": "", "err": "Sign-in cancelled"}

        def finished(token, err):
            result.update(token=token, err=err)
            done.set()

        def in_app():
            WebLoginDialog(f"{session.cfg.name} VPN sign-in", start, login.username, login.password,
                           finished).present(self.window)

        def show():
            if not self.window:
                done.set()
            elif in_browser:
                BrowserLoginDialog(f"{session.cfg.name} VPN sign-in", start, session.cfg.vpn.browser, finished,
                                   in_app).present(self.window)
            else:
                in_app()
            return False

        GLib.idle_add(show)
        done.wait()
        return result["token"], result["err"]

    def browser_login(self, session: ClusterSession, start, login) -> tuple[str, str]:
        return self.web_login(session, start, login, in_browser=True)

    # -- main-thread handlers ---------------------------------------------------------
    def _on_state(self, session: ClusterSession) -> bool:
        if self.window:
            self.window.cards[session.cfg.id].refresh()
            self.window.jobs.session_changed(session)
            self.window.usage.session_changed(session)
            self.window.files.session_changed(session)
            self.window.projects.session_changed(session)
        name = session.cfg.name
        self._sync_duo(session)
        if session.state == State.DUO:
            self._notify(f"duo-{session.cfg.id}", f"{name}: approve Duo", session.detail)
        elif session.state == State.CONNECTED:
            self.withdraw_notification(f"duo-{session.cfg.id}")
            a = session.allocation
            body = f"Node {a.node}, job {a.job_id}" if a else (session.detail or "Logged in")
            self._notify(f"up-{session.cfg.id}", f"{name} connected", body)
        elif session.state == State.ERROR:
            self.withdraw_notification(f"duo-{session.cfg.id}")
            if self.window:
                self.window.toast(f"{name}: {session.detail}")
        return False

    def _sync_duo(self, session: ClusterSession) -> None:
        cid = session.cfg.id
        dialog = self.duo_dialogs.get(cid)
        if session.state == State.DUO and not dialog and self.window:
            dialog = DuoDialog(session.cfg.name, session.cancel)
            self.duo_dialogs[cid] = dialog
            dialog.present(self.window)
        elif session.state != State.DUO and dialog:
            del self.duo_dialogs[cid]
            dialog.done()

    def _on_log(self, session: ClusterSession, line: str) -> bool:
        if self.window:
            self.window.cards[session.cfg.id].append_log(line)
        return False

    def _notify(self, nid: str, title: str, body: str) -> None:
        if self.window and self.window.is_active():
            return
        n = Gio.Notification.new(title)
        n.set_body(body)
        self.send_notification(nid, n)

    def _ask_dialog(self, session, prompt, result, done) -> bool:
        dialog = Adw.AlertDialog(heading=f"{session.cfg.name} is asking", body=prompt.strip())
        entry = Gtk.PasswordEntry(show_peek_icon=True, activates_default=True)
        dialog.set_extra_child(entry)
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("ok", "Send")
        dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response("ok")
        dialog.set_close_response("cancel")

        def on_response(_d, response):
            result["answer"] = entry.get_text() if response == "ok" else None
            done.set()

        dialog.connect("response", on_response)
        dialog.present(self.window)
        return False

    def _code_dialog(self, session, result, done) -> bool:
        """The 6-digit code from an authenticator app; sent as soon as it is typed."""
        dialog = Adw.AlertDialog(heading=f"Code for {session.cfg.name}",
                                 body="Open your authenticator app and type the 6-digit code.")
        entry = Gtk.Entry(input_purpose=Gtk.InputPurpose.DIGITS, max_length=8, activates_default=True,
                          xalign=0.5, placeholder_text="123456", css_classes=["title-2", "numeric"])
        dialog.set_extra_child(entry)
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("ok", "Send")
        dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response("ok")
        dialog.set_close_response("cancel")

        def on_response(_d, response):
            if not done.is_set():
                result["answer"] = entry.get_text().strip().replace(" ", "") if response == "ok" else None
                done.set()

        def typed(*_):
            text = entry.get_text().replace(" ", "")
            if len(text) == 6 and text.isdigit():
                on_response(dialog, "ok")
                dialog.force_close()
        dialog.connect("response", on_response)
        entry.connect("changed", typed)
        dialog.present(self.window)
        entry.grab_focus()
        return False

    # -- user actions ----------------------------------------------------------------
    def open_settings(self, session: ClusterSession, hint: str = "") -> None:
        def saved(_cfg):
            config.save(self.clusters)
            self.window.cards[session.cfg.id].refresh()
            self.window.toast(f"{session.cfg.name} settings saved")

        def edit_remote(path, template):
            if session.connected:
                self.tools.edit_remote(session, path, template)
            else:
                dialog.add_toast(Adw.Toast(title=f"Connect to {session.cfg.name} first"))

        dialog = ClusterSettingsDialog(session.cfg, saved, edit_remote, session.limits)
        dialog.present(self.window)
        if hint:
            dialog.add_toast(Adw.Toast(title=hint, timeout=5))

    def open_tool(self, session: ClusterSession, tool: str) -> None:
        if tool.startswith("vscode"):
            target = tool.partition(":")[2]
            if target:
                session.cfg.vscode.open_in = target  # remember the choice
                config.save(self.clusters)
            self.tools.vscode(session, target=target)
        elif tool.startswith("agent:"):
            self.tools.agent(session, tool.partition(":")[2])
        elif tool == "ask":
            self.tools.ask_all(session)
        elif tool == "files":
            self.window.files.show_cluster(session)
            self.window.stack.set_visible_child_name("files")

    def _tool_in_folder(self, session: ClusterSession, tool: str, folder: str) -> None:
        if tool == "vscode":
            self.tools.vscode(session, folder)
        elif tool.startswith("agent:"):
            self.tools.agent(session, tool.partition(":")[2], folder)

    def _open_files(self, session: ClusterSession, folder: str) -> None:
        self.window.files.open_at(session, folder)
        self.window.stack.set_visible_child_name("files")

    def _open_latex_project(self, session: ClusterSession, project) -> None:
        self.window.latex.open_project(session, project)
        self.window.stack.set_visible_child_name("latex")

    def connect_session(self, session: ClusterSession, vpn_only: bool = False) -> None:
        cfg = session.cfg
        ssh_login = credentials.load(cfg.id, credentials.SSH)
        if not ssh_login or not ssh_login.username:
            self.open_settings(session, "Enter your username and password first")
            return
        vpn_login = None
        if cfg.vpn.enabled:
            vpn_login = ssh_login if cfg.vpn.same_login_as_ssh else credentials.load(cfg.id, credentials.VPN)
            if vpn_login and not vpn_login.password:
                vpn_login = credentials.Login(vpn_login.username, ssh_login.password)
            if not vpn_login or not vpn_login.username:
                self.open_settings(session, "Enter your VPN login first")
                return

        # split-tunnel VPNs can run side by side; a full tunnel takes over all traffic
        blockers = [s for s in self.sessions.values()
                    if s is not session and s.cfg.vpn.enabled and cfg.vpn.enabled
                    and not (s.cfg.vpn.split_tunnel and cfg.vpn.split_tunnel)
                    and s.state not in (State.DISCONNECTED, State.ERROR)]
        if not blockers:
            session.connect(ssh_login, vpn_login, vpn_only)
            return

        other = blockers[0]
        dialog = Adw.AlertDialog(
            heading=f"Disconnect {other.cfg.name}?",
            body=f"Split tunnel is off, so only one VPN can run. {other.cfg.name} will be disconnected "
                 f"and its compute node released.")
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("switch", f"Switch to {cfg.name}")
        dialog.set_response_appearance("switch", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_d, response):
            if response == "switch":
                other.disconnect(on_done=lambda: GLib.idle_add(
                    lambda: session.connect(ssh_login, vpn_login, vpn_only) and False))

        dialog.connect("response", on_response)
        dialog.present(self.window)

    def disconnect_session(self, session: ClusterSession) -> None:
        session.disconnect()

    # -- health ---------------------------------------------------------------------------
    def _health_check(self) -> bool:
        for s in self.sessions.values():
            if s.state == State.CONNECTED:
                threading.Thread(target=self._check_one, args=(s,), daemon=True).start()
        return True

    def _watch_sleep(self) -> None:
        """Check every connection right after the laptop wakes up (VPN and SSH rarely survive sleep)."""
        def on_signal(_bus, _sender, _path, _iface, _signal, params):
            if not params.unpack()[0]:  # False = resumed
                GLib.timeout_add_seconds(5, lambda: self._health_check() and False)
        try:
            bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
            bus.signal_subscribe("org.freedesktop.login1", "org.freedesktop.login1.Manager", "PrepareForSleep",
                                 "/org/freedesktop/login1", None, Gio.DBusSignalFlags.NONE, on_signal)
        except GLib.Error:
            pass

    def _check_one(self, session: ClusterSession) -> None:
        if not session.healthy():
            GLib.idle_add(lambda: session.mark_lost() and False)
        else:
            session.check_node()

    def _about(self) -> None:
        about = Adw.AboutDialog(
            application_name=APP_NAME, version=__version__, application_icon="network-server-symbolic",
            comments="Wulver, Yale and SDSC in one place.")
        about.present(self.window)


def main() -> int:
    return HpcHubApp().run(None)
