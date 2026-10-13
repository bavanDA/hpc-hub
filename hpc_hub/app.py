"""Application: owns sessions, bridges worker threads to the GTK main loop."""

import threading

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk  # noqa: E402

from . import APP_ID, APP_NAME, __version__, config, credentials  # noqa: E402
from .askpass_server import AskpassServer  # noqa: E402
from .session import ClusterSession, State  # noqa: E402
from .ui.settings import ClusterSettingsDialog  # noqa: E402
from .ui.window import MainWindow  # noqa: E402

CSS = """
.cluster-card { padding: 18px; }
.status-pill { padding: 2px 10px; border-radius: 999px; font-weight: bold; font-size: smaller;
               background: alpha(currentColor, 0.1); }
.log-view { font-size: smaller; padding: 6px; }
"""

HEALTH_SECONDS = 30


class HpcHubApp(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.window: MainWindow | None = None
        self.sessions: dict[str, ClusterSession] = {}
        self.askpass = AskpassServer()
        self._quitting = False

    # -- lifecycle -----------------------------------------------------------------
    def do_startup(self):
        Adw.Application.do_startup(self)
        css = Gtk.CssProvider()
        css.load_from_string(CSS)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        self.askpass.start()
        self.clusters = config.load()
        self.sessions = {c.id: ClusterSession(c, self.askpass, self) for c in self.clusters}

        for name, handler, accels in (
            ("quit", lambda *_: self._request_quit(), ["<primary>q"]),
            ("about", lambda *_: self._about(), []),
        ):
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", handler)
            self.add_action(action)
            if accels:
                self.set_accels_for_action(f"app.{name}", accels)
        GLib.timeout_add_seconds(HEALTH_SECONDS, self._health_check)

    def do_activate(self):
        if not self.window:
            self.window = MainWindow(
                self, list(self.sessions.values()),
                self.connect_session, self.disconnect_session, self.open_settings)
            self.window.connect("close-request", self._on_close_request)
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

    # -- main-thread handlers ---------------------------------------------------------
    def _on_state(self, session: ClusterSession) -> bool:
        if self.window:
            self.window.cards[session.cfg.id].refresh()
        name = session.cfg.name
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

    # -- user actions ----------------------------------------------------------------
    def open_settings(self, session: ClusterSession, hint: str = "") -> None:
        def saved(_cfg):
            config.save(self.clusters)
            self.window.cards[session.cfg.id].refresh()
            self.window.toast(f"{session.cfg.name} settings saved")

        dialog = ClusterSettingsDialog(session.cfg, saved)
        dialog.present(self.window)
        if hint:
            dialog.add_toast(Adw.Toast(title=hint, timeout=5))

    def connect_session(self, session: ClusterSession) -> None:
        cfg = session.cfg
        ssh_login = credentials.load(cfg.id, credentials.SSH)
        if not ssh_login or not ssh_login.username:
            self.open_settings(session, "Enter your username and password first")
            return
        vpn_login = None
        if cfg.vpn.enabled:
            vpn_login = ssh_login if cfg.vpn.same_login_as_ssh else credentials.load(cfg.id, credentials.VPN)
            if not vpn_login or not vpn_login.username:
                self.open_settings(session, "Enter your VPN login first")
                return

        blockers = [s for s in self.sessions.values()
                    if s is not session and s.cfg.vpn.enabled and cfg.vpn.enabled
                    and s.state not in (State.DISCONNECTED, State.ERROR)]
        if not blockers:
            session.connect(ssh_login, vpn_login)
            return

        other = blockers[0]
        dialog = Adw.AlertDialog(
            heading=f"Disconnect {other.cfg.name}?",
            body=f"Only one VPN can run at a time. {other.cfg.name} will be disconnected "
                 f"and its compute node released.")
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("switch", f"Switch to {cfg.name}")
        dialog.set_response_appearance("switch", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_d, response):
            if response == "switch":
                other.disconnect(on_done=lambda: GLib.idle_add(
                    lambda: session.connect(ssh_login, vpn_login) and False))

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

    def _check_one(self, session: ClusterSession) -> None:
        if not session.healthy():
            GLib.idle_add(lambda: session.mark_lost() and False)

    # -- quitting -------------------------------------------------------------------------
    def _active(self) -> list[ClusterSession]:
        return [s for s in self.sessions.values() if s.state not in (State.DISCONNECTED, State.ERROR)]

    def _on_close_request(self, *_):
        if self._quitting or not self._active():
            return False
        self._request_quit()
        return True

    def _request_quit(self) -> None:
        active = self._active()
        if not active:
            self.quit()
            return
        names = ", ".join(s.cfg.name for s in active)
        dialog = Adw.AlertDialog(
            heading="Disconnect and quit?",
            body=f"{names} will be disconnected and compute nodes released.")
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("quit", "Disconnect and Quit")
        dialog.set_response_appearance("quit", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_d, response):
            if response != "quit":
                return
            self._quitting = True
            pending = {"n": len(active)}

            def one_done():
                pending["n"] -= 1
                if pending["n"] == 0:
                    GLib.idle_add(lambda: self.quit() and False)

            for s in active:
                s.disconnect(on_done=one_done)

        dialog.connect("response", on_response)
        dialog.present(self.window)

    def _about(self) -> None:
        about = Adw.AboutDialog(
            application_name=APP_NAME, version=__version__, application_icon="network-server-symbolic",
            comments="Wulver, Yale and SDSC in one place.")
        about.present(self.window)


def main() -> int:
    return HpcHubApp().run(None)
