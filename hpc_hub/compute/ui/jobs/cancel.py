"""Cancel a job: one short question that says what you lose (time run, what runs in it, HPC Hub's node)."""

from gi.repository import Adw

from ....connect.session import ClusterSession
from ....terminals import tmux
from ....ui.widgets import bg
from ...jobs import JobInfo, cancel_job, ran_for, wait_gone


class CancelMixin:
    """JobsPage's Cancel buttons."""

    def _confirm_cancel(self, j: JobInfo | None) -> None:
        """Say exactly what stops (node, time used, sessions on it), default to keeping it."""
        if not j or not self.session.ssh:
            return
        s = self.session

        def look():  # sessions the app started on this job are named hpchub-<agent>-<job>-...
            return [t.title for t in tmux.list_sessions(s.ssh).sessions if f"-{j.job_id}-" in t.name]
        bg(look, lambda inside, _err: self._ask_cancel(s, j, inside or []))

    def _ask_cancel(self, s: ClusterSession, j: JobInfo, inside: list[str]) -> None:
        app_node = s.allocation is not None and s.allocation.job_id == j.job_id
        running = j.state == "RUNNING"
        lines = [f"It has run {ran_for(j.elapsed)}. Its output so far stays in your folder." if running
                 else "It's still waiting in the queue. Nothing has started yet."]
        if inside:
            lines.append("These stop too: " + ", ".join(inside) + ".")
        if app_node:
            lines.append("HPC Hub runs your terminals on this node, so you'll be left without one.")
        dialog = Adw.AlertDialog(heading=f"Cancel {j.name or f'job {j.job_id}'}?", body="\n\n".join(lines),
                                 prefer_wide_layout=True)  # the two answers side by side, the safe one first
        dialog.add_response("keep", "Keep running" if running else "Keep waiting")
        dialog.add_response("cancel", "Cancel job")  # the risky answer on the right, red
        dialog.set_response_appearance("cancel", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.set_default_response("keep")
        dialog.set_close_response("keep")

        def on_response(_d, response):
            if response != "cancel":
                return
            self.toast(f"Cancelling job {j.job_id}…")

            def work():
                cancel_job(s.ssh, j.job_id)
                if app_node:
                    s.allocation = None
                    s.listener.state_changed(s)
                return wait_gone(s.ssh, j.job_id)

            def done(gone, err):
                self.toast(f"Couldn't cancel job {j.job_id}: {err}" if err
                           else f"Job {j.job_id} is cancelled" if gone
                           else f"Cancel sent. Slurm is still stopping job {j.job_id}")
                self.refresh(quiet=True)
            bg(work, done)

        dialog.connect("response", on_response)
        dialog.present(self.get_root())
