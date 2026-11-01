"""Questions a login asks you while it runs (password, code, where to sign in), as dialogs on the main window."""

import threading

from gi.repository import Adw, GLib, Gtk

from .. import chrome_window
from ..session import ClusterSession
from .authenticator_help import AuthenticatorHelp
from .browser_login import ChromeWindowDialog
from .web_login import WebLoginDialog


class LoginPromptsMixin:
    """HpcHubApp's Listener questions: called from worker threads, they wait for your answer. Needs self.window."""

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

    def web_login(self, session: ClusterSession, start, login, profile: str = "", title: str = "",
                  note: str = "") -> tuple[str, str]:
        """A web sign-in: the VPN's, or a portal's (title says which). note is for the desktop app's dialog."""
        title = title or f"{session.cfg.name} VPN sign-in"
        done = threading.Event()
        result = {"token": "", "err": "Sign-in cancelled"}

        def finished(token, err):
            result.update(token=token, err=err)
            done.set()

        def in_app():
            WebLoginDialog(title, start, login.username, login.password, finished).present(self.window)

        def show():
            if not self.window:
                done.set()
            elif profile == chrome_window.CHOICE:
                ChromeWindowDialog(title, start, finished, in_app).present(self.window)
            else:
                in_app()
            return False

        GLib.idle_add(show)
        done.wait()
        return result["token"], result["err"]

    def pick_browser(self, session: ClusterSession) -> str:
        """The choice saved in the cluster's settings, never a question while connecting. Never your own Chrome."""
        if session.cfg.vpn.browser == chrome_window.CHOICE and chrome_window.available():
            return chrome_window.CHOICE
        return ""

    # -- main-thread dialogs ---------------------------------------------------------
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
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        box.append(entry)
        help_btn = Gtk.Button(label="No code yet? How to set it up", css_classes=["flat"], halign=Gtk.Align.CENTER)
        help_btn.connect("clicked", lambda *_: AuthenticatorHelp(session.cfg).present(self.window))
        box.append(help_btn)
        dialog.set_extra_child(box)
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
