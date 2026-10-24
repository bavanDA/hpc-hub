"""Quitting: closing the window keeps everything running; the menu can disconnect all first."""

from gi.repository import Adw, GLib

from ..connect.session import ClusterSession, State


class QuitMixin:
    """HpcHubApp: self.sessions, self.window and self._quitting."""

    def _active(self) -> list[ClusterSession]:
        return [s for s in self.sessions.values() if s.state not in (State.DISCONNECTED, State.ERROR)]

    def _on_close_request(self, *_):
        """Closing keeps everything running (VPN, logins, nodes); the next start picks it all up."""
        if self._quitting or not any(s.state.busy for s in self.sessions.values()):
            self._quitting = True
            return False
        self._request_quit()
        return True

    def _request_quit(self) -> None:
        busy = [s for s in self.sessions.values() if s.state.busy]
        if not busy:
            self._quitting = True
            self.quit()
            return
        dialog = Adw.AlertDialog(
            heading="Still connecting",
            body=f"{', '.join(s.cfg.name for s in busy)} is still signing in. Quit anyway? "
                 "Everything already connected keeps running.")
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("quit", "Quit")

        def on_response(_d, response):
            if response == "quit":
                for s in busy:
                    s.cancel()
                self._quitting = True
                self.quit()

        dialog.connect("response", on_response)
        dialog.present(self.window)

    def _disconnect_and_quit(self) -> None:
        active = self._active()
        if not active:
            self._quitting = True
            self.quit()
            return
        names = ", ".join(s.cfg.name for s in active)
        dialog = Adw.AlertDialog(
            heading="Disconnect everything and quit?",
            body=f"{names}: the VPN goes down and compute nodes the app requested are released, which ends "
                 "anything running on them (Claude remote, ChatGPT remote…). Jobs you started yourself and "
                 "VS Code jobs keep running.")
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
