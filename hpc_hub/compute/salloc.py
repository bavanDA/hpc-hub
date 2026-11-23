"""An interactive node: salloc --no-shell, followed until Slurm grants it."""

import re
import shlex
import subprocess
import threading
import time
from collections.abc import Callable

from ..core.config import ComputeProfile
from ..core.ssh import SshMaster
from .slurm import MAIN_JOB, Allocation, SlurmError, cancel, node_of
from .slurm_args import checked, resource_args

JOB_RE = re.compile(r"(Granted|Pending) job allocation (\d+)")


def salloc_command(p: ComputeProfile, job_name: str = MAIN_JOB) -> str:
    args = ["salloc", "--no-shell", f"--job-name={job_name}", *resource_args(p)]
    return " ".join(shlex.quote(a) for a in args)


def allocate(
    ssh: SshMaster,
    profile: ComputeProfile,
    log: Callable[[str], None],
    on_pending: Callable[[str], None] = lambda job_id: None,
    cancelled: Callable[[], bool] = lambda: False,
    job_name: str = MAIN_JOB,
    again: bool = True,
) -> Allocation:
    checked(profile)
    command = salloc_command(profile, job_name)
    ran = getattr(ssh, "wrap", str)(command)  # as it runs: with the PATH that has Slurm, if one was found
    proc = ssh.popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    job_id, granted, last = "", False, ""
    stopped = threading.Event()

    def stop() -> None:
        """Cancel the job itself: stopping the local ssh isn't enough. Over a shared OpenSSH connection salloc
        keeps running on the login node, its job stays in the queue and its output never ends."""
        if job_id and not stopped.is_set():
            stopped.set()
            cancel(ssh, job_id)
        proc.terminate()

    def watch():
        while proc.poll() is None:
            if cancelled():
                stop()
                return
            time.sleep(0.5)

    threading.Thread(target=watch, daemon=True).start()
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        last = line
        log(f"slurm: {line}")
        m = JOB_RE.search(line)
        if m:
            job_id = m.group(2)
            granted = granted or m.group(1) == "Granted"
            if cancelled():  # stopped before Slurm named the job
                stop()
            elif not granted:
                on_pending(job_id)
    code = proc.wait()

    late = getattr(ssh, "slurm_found_late", None)  # salloc not found: Slurm's PATH looked for again, then once more
    if again and code != 0 and not job_id and not cancelled() and late and \
            late(ran, subprocess.CompletedProcess(command, code, "", last)):
        return allocate(ssh, profile, log, on_pending, cancelled, job_name, again=False)
    if cancelled() or code != 0 or not granted:
        if job_id and not stopped.is_set():
            cancel(ssh, job_id)
        if cancelled():
            raise SlurmError("Cancelled")
        raise SlurmError(last or "salloc failed")
    return Allocation(job_id, node_of(ssh, job_id))
