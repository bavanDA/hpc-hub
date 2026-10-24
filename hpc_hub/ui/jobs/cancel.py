"""Cancel a job, after saying exactly what stops."""

from gi.repository import Adw

from ... import tmux
from ...jobs import JobInfo, cancel_job, wait_gone
from ...connect.session import ClusterSession
from ..widgets import bg


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
        lines = [f"{j.name} · {j.partition}",
                 f"Node: {j.where}" if j.state == "RUNNING" else f"Waiting: {j.where}",
                 f"Running for {j.elapsed} of {j.limit}" if j.state == "RUNNING" else None]
        if inside:
            lines.append("Running in it: " + ", ".join(inside))
        if app_node:
            lines.append("HPC Hub is using this node.")
        lines.append("")
        lines.append("Everything running in this job stops right away and can't be brought back."
                     if j.state == "RUNNING" else "It leaves the queue. Nothing has started yet.")
        dialog = Adw.AlertDialog(heading=f"Cancel job {j.job_id}?", body="\n".join(x for x in lines if x is not None))
        dialog.add_response("cancel", "Cancel job")  # stacked buttons show the last one on top
        dialog.add_response("keep", "Keep running" if j.state == "RUNNING" else "Keep waiting")
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
                self.toast(f"Could not cancel job {j.job_id}: {err}" if err
                           else f"Job {j.job_id} is cancelled and gone from the queue" if gone
                           else f"Cancel sent. Slurm is still stopping job {j.job_id}")
                self.refresh(quiet=True)
            bg(work, done)

        dialog.connect("response", on_response)
        dialog.present(self.get_root())
