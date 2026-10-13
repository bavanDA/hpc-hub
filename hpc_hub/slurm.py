"""Slurm helpers: request a compute node, find it, release it."""

import re
import shlex
import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from .config import ComputeProfile
from .ssh import SshMaster

SAFE = re.compile(r"^[A-Za-z0-9_.,:=+-]*$")
TIME = re.compile(r"^(\d+-)?\d{1,2}(:\d{2}){0,2}$")
JOB_RE = re.compile(r"(Granted|Pending) job allocation (\d+)")


class SlurmError(Exception):
    pass


@dataclass
class Allocation:
    job_id: str
    node: str


def validate(p: ComputeProfile) -> list[str]:
    errors = []
    if p.cpus < 1:
        errors.append("Cores must be at least 1")
    if p.mem_gb < 1:
        errors.append("Memory must be at least 1 GB")
    if not TIME.match(p.time):
        errors.append("Wall time must look like 04:00:00 or 1-00:00:00")
    for label, value in (("Partition", p.partition), ("Account", p.account), ("QOS", p.qos)):
        if not SAFE.match(value):
            errors.append(f"{label} has invalid characters")
    try:
        shlex.split(p.extra_args)
    except ValueError:
        errors.append("Extra arguments have unbalanced quotes")
    return errors


def salloc_command(p: ComputeProfile, job_name: str = "hpc-hub") -> str:
    args = [
        "salloc", "--no-shell", f"--job-name={job_name}",
        f"--cpus-per-task={p.cpus}", f"--mem={p.mem_gb}G", f"--time={p.time}",
    ]
    if p.partition:
        args.append(f"--partition={p.partition}")
    if p.account:
        args.append(f"--account={p.account}")
    if p.qos:
        args.append(f"--qos={p.qos}")
    if p.gpus:
        args.append(f"--gres=gpu:{p.gpus}")
    args += shlex.split(p.extra_args)
    return " ".join(shlex.quote(a) for a in args)


def cancel(ssh: SshMaster, job_id: str) -> None:
    ssh.run(f"scancel {int(job_id)}")


def job_state(ssh: SshMaster, job_id: str) -> str:
    res = ssh.run(f"squeue -h -j {int(job_id)} -o %T")
    return res.stdout.strip()


def node_of(ssh: SshMaster, job_id: str) -> str:
    for _ in range(10):
        node = ssh.run(f"squeue -h -j {int(job_id)} -o %N").stdout.strip()
        if node:
            return node.split(",")[0]
        time.sleep(1)
    raise SlurmError(f"Job {job_id} has no node")


def allocate(
    ssh: SshMaster,
    profile: ComputeProfile,
    log: Callable[[str], None],
    on_pending: Callable[[str], None] = lambda job_id: None,
    cancelled: Callable[[], bool] = lambda: False,
    job_name: str = "hpc-hub",
) -> Allocation:
    errors = validate(profile)
    if errors:
        raise SlurmError("; ".join(errors))
    proc = ssh.popen(salloc_command(profile, job_name), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    def watch():
        while proc.poll() is None:
            if cancelled():
                proc.terminate()
                return
            time.sleep(0.5)

    threading.Thread(target=watch, daemon=True).start()
    job_id, granted, last = "", False, ""
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
            if not granted:
                on_pending(job_id)
    code = proc.wait()

    if cancelled() or code != 0 or not granted:
        if job_id:
            cancel(ssh, job_id)
        if cancelled():
            raise SlurmError("Cancelled")
        raise SlurmError(last or "salloc failed")
    return Allocation(job_id, node_of(ssh, job_id))
