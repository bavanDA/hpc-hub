"""Compute nodes for a connected session: pick the queue, ask Slurm, reuse a running job, give it back."""

import subprocess
import threading
from dataclasses import replace

from ..compute import limits, slurm
from ..compute.slurm import Allocation, SlurmError
from ..core.config import ComputeProfile
from ..core.ssh import SshError
from .messages import STOPPED_WAITING
from .state import State


class NodesMixin:
    """ClusterSession's node handling. Uses self.ssh, self.cfg, self.limits, self.allocation, self.default_account,
    self._cancel, self._set and self._log."""

    def fit(self, profile: ComputeProfile, pick_queue: bool = True) -> ComputeProfile:
        """The profile with your default account named when none is set, on the best queue (see queues), with
        its time cut to what that queue allows (Slurm would refuse it otherwise). Blocking; worker thread.
        pick_queue=False keeps the queue you asked for (Fast node)."""
        if not profile.account and self._account():
            profile = replace(profile, account=self._account())
        if pick_queue:
            profile = self._best_queue(profile)
        fitted, note = self._cut_time(profile)
        if note:
            self._log(note)
        return fitted

    def _cut_time(self, profile: ComputeProfile) -> tuple[ComputeProfile, str]:
        return self.limits.fit(profile) if self.limits else (profile, "")

    def _best_queue(self, profile: ComputeProfile) -> ComputeProfile:
        """Ask Slurm how long each queue in cfg.queues would wait (nothing is submitted). Of those that start
        within queue_wait seconds, take the first listed (cheapest); if none does, the one that starts soonest.
        A queue Slurm would refuse for this request (e.g. more cores than debug allows) is skipped."""
        listed = [tuple(x.strip() for x in o.split(":", 1)) for o in self.cfg.queues.split(",") if ":" in o]
        if not listed or not self.ssh:
            return profile
        mine = (profile.partition, profile.qos)
        order = listed if mine in listed else [mine, *listed]
        found = []  # (wait, rank, profile)
        try:
            for rank, (part, qos) in enumerate(order):
                p, _ = self._cut_time(replace(profile, partition=part, qos=qos))
                wait = slurm.wait_seconds(self.ssh, p)
                if wait is not None:
                    found.append((wait, rank, p))
        except (SshError, OSError, subprocess.SubprocessError):
            return profile
        if not found:
            return profile
        soon = [f for f in found if f[0] <= self.cfg.queue_wait]
        wait, _, best = min(soon, key=lambda f: f[1]) if soon else min(found, key=lambda f: (f[0], f[1]))
        seen = ", ".join(f"{p.partition}/{p.qos} {slurm.human_wait(w)}" for w, _, p in found)
        self._log(f"Queues: {seen}. Using {best.partition}/{best.qos}")
        return best

    def _account(self) -> str:
        if self.default_account is None and self.ssh:
            try:
                self.default_account = slurm.default_account(self.ssh)
            except (SshError, OSError, subprocess.SubprocessError):
                return ""
        return self.default_account or ""

    def _read_limits(self) -> None:
        def run():
            try:
                self.limits = limits.fetch(self.ssh, self.cfg.id)
            except (SshError, OSError, subprocess.SubprocessError):
                pass
        threading.Thread(target=run, daemon=True).start()

    def request_node(self, profile: ComputeProfile | None = None) -> None:
        """Ask for a node on an already connected session (profile: what you picked, else the saved one)."""
        if self.state != State.CONNECTED or self.allocation:
            return
        self.pick_node = False
        self._cancel.clear()
        self._thread = threading.Thread(target=self._allocate_safely, args=(profile,), daemon=True)
        self._thread.start()

    def request_fast_node(self) -> None:
        """A node on the cluster's fast queue (cfg.fast, e.g. debug for 30 minutes): short, but it starts soon."""
        fast = self.cfg.fast_profile()
        if not fast or self.state != State.CONNECTED or self.allocation:
            return
        self.pick_node = False
        self._cancel.clear()
        self._thread = threading.Thread(target=self._allocate_safely, args=(fast, False), daemon=True)
        self._thread.start()

    def release_node(self) -> None:
        """Give the node back (scancel) but stay connected. Your own borrowed job keeps running."""
        a = self.allocation
        if not self.connected or not a:
            return

        def run():
            if a.owned:
                self._release(a.job_id)
            else:
                self._log(f"Stopped using your job {a.job_id}, it keeps running")
            self.allocation = None
            self._set(State.CONNECTED)

        threading.Thread(target=run, daemon=True).start()

    def ensure_node(self, on_done, profile: ComputeProfile | None = None) -> None:
        """Get a node if we have none (or ours ended); on_done(Allocation | None) runs on a worker thread."""
        if self.state != State.CONNECTED:
            on_done(self.allocation)
            return

        def run():
            self.check_node()
            if not self.allocation:
                self._cancel.clear()
                self._allocate_safely(profile)
            on_done(self.allocation)

        threading.Thread(target=run, daemon=True).start()

    def extra_node(self, job_name: str, on_done, profile: ComputeProfile | None = None) -> None:
        """Separate allocation (e.g. Claude on a new node). Kept when you disconnect."""
        def run():
            try:
                a = slurm.allocate(self.ssh, self.fit(profile or self.cfg.profile), self._log, job_name=job_name)
                a.owned = False
                self._log(f"Extra node {a.node} (job {a.job_id}) for {job_name}")
                on_done(a, "")
            except (SlurmError, OSError, subprocess.SubprocessError) as e:
                self._log(f"Node request for {job_name} failed: {e}")
                on_done(None, str(e))

        threading.Thread(target=run, daemon=True).start()

    def check_node(self) -> None:
        """Blocking. Our job can end under us (time limit, scancel): switch to another running one."""
        a = self.allocation
        if not a or not self.connected:
            return
        try:
            running = {j.job_id for j in slurm.running_jobs(self.ssh)}
        except (OSError, subprocess.SubprocessError):
            return  # can't tell, keep it
        if a.job_id in running or self.allocation is not a:
            return
        self._log(f"Job {a.job_id} on {a.node} has ended")
        self.allocation = None
        self._reuse_running_job()
        self._set(State.CONNECTED)

    def _reuse_running_job(self, quiet: bool = False) -> bool:
        """The app's own node ("hpc-hub") first, then its other nodes (Claude, ChatGPT…).
        With "Use my running job" on, any job of yours counts too."""
        try:
            jobs = slurm.running_jobs(self.ssh)
        except (OSError, subprocess.SubprocessError) as e:
            self._log(f"Could not list jobs: {e}")
            return False
        own = [j for j in jobs if j.name == slurm.MAIN_JOB]
        if own:
            job = max(own, key=lambda j: int(j.job_id))
            self.allocation = Allocation(job.job_id, job.node, owned=True)
        else:
            mine = [j for j in jobs if j.name != "hpc-hub-vscode"]  # VS Code's node is VS Code's
            ours = [j for j in mine if j.name.startswith("hpc-hub")]
            job = slurm.pick_reusable(mine if self.cfg.reuse_running_job else ours, self.cfg.profile.partition)
            if not job:
                return False
            self.allocation = Allocation(job.job_id, job.node, owned=False)
        if not quiet:
            self._log(f"Reusing running job {job.job_id} ({job.name}) on {job.node}")
        return True

    def _job_running(self, job_id: str) -> bool:
        try:
            return slurm.job_state(self.ssh, job_id) == "RUNNING"
        except (OSError, subprocess.SubprocessError):
            return False

    def _allocate_safely(self, profile: ComputeProfile | None = None, pick_queue: bool = True) -> None:
        profile = profile or self.cfg.profile
        if self._reuse_running_job():
            self._set(State.CONNECTED)
            return
        self._set(State.ALLOCATING, profile.summary())
        try:
            self.allocation = slurm.allocate(
                self.ssh, self.fit(profile, pick_queue), self._log,
                on_pending=lambda job: self._set(State.ALLOCATING, f"Job {job} waiting in queue"),
                cancelled=self._cancel.is_set,
            )
        except (SlurmError, OSError, subprocess.SubprocessError) as e:
            self._log(f"Node request failed: {e}")
            self._set(State.CONNECTED, STOPPED_WAITING if self._cancel.is_set() else f"No compute node: {e}")
            return
        self._set(State.CONNECTED)

    def _release(self, job_id: str) -> None:
        """scancel a node the app asked for. Blocking."""
        try:
            slurm.cancel(self.ssh, job_id)
            self._log(f"Released job {job_id}")
        except (OSError, ValueError, subprocess.SubprocessError) as e:
            self._log(f"Could not cancel job: {e}")
