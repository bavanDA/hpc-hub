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
MAIN_JOB = "hpc-hub"  # the node the app asks for on connect


class SlurmError(Exception):
    pass


@dataclass
class Allocation:
    job_id: str
    node: str
    owned: bool = True  # False: your own job we borrowed; never scancel it


@dataclass
class Job:
    job_id: str
    name: str
    node: str
    partition: str


JOBS_FORMAT = "%i|%j|%N|%P"


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


def resource_args(p: ComputeProfile) -> list[str]:
    args = [f"--cpus-per-task={p.cpus}", f"--mem={p.mem_gb}G", f"--time={p.time}"]
    if p.partition:
        args.append(f"--partition={p.partition}")
    if p.account:
        args.append(f"--account={p.account}")
    if p.qos:
        args.append(f"--qos={p.qos}")
    if p.gpus:
        args.append(f"--gres=gpu:{p.gpus}")
    return args + shlex.split(p.extra_args)


def salloc_command(p: ComputeProfile, job_name: str = "hpc-hub") -> str:
    args = ["salloc", "--no-shell", f"--job-name={job_name}", *resource_args(p)]
    return " ".join(shlex.quote(a) for a in args)


# -- batch jobs (VS Code) -------------------------------------------------------------

BATCH_DIR = ".hpc-hub"  # under $HOME on the cluster


def batch_script(p: ComputeProfile, job_name: str, body: str) -> str:
    """Script for sbatch; the log lands in ~/.hpc-hub/<name>-<job>.out."""
    lines = ["#!/bin/bash -l", f"#SBATCH --job-name={job_name}", f"#SBATCH --output={job_name}-%j.out"]
    lines += [f"#SBATCH {a}" for a in resource_args(p)]
    return "\n".join(lines + ["", body, ""])


def submit(ssh: SshMaster, p: ComputeProfile, job_name: str, body: str) -> str:
    """sbatch the script (sent on stdin, no temp file), return the job id."""
    errors = validate(p)
    if errors:
        raise SlurmError("; ".join(errors))
    script = batch_script(p, job_name, body)
    cmd = (f'mkdir -p "$HOME/{BATCH_DIR}" && cd "$HOME/{BATCH_DIR}" && '
           f"printf %s {shlex.quote(script)} | sbatch --parsable")
    res = ssh.run(cmd, timeout=60)
    job_id = res.stdout.strip().split(";")[0]
    if res.returncode != 0 or not job_id.isdigit():
        raise SlurmError(res.stderr.strip() or res.stdout.strip() or "sbatch failed")
    return job_id


def find_job(ssh: SshMaster, names: list[str]) -> Job | None:
    """Your newest pending or running job with one of these names."""
    fmt = "%i|%j|%N|%P"
    res = ssh.run(f'squeue -h -u "$USER" -t PENDING,RUNNING -n {shlex.quote(",".join(names))} -o {shlex.quote(fmt)}')
    jobs = [Job(*parts) for line in res.stdout.splitlines()
            if len(parts := line.strip().split("|")) == 4 and parts[0].isdigit()]
    return max(jobs, key=lambda j: int(j.job_id), default=None)


def log_path(job_id: str) -> str:
    """Shell snippet that prints the job's stdout file."""
    return f'scontrol show job -o {int(job_id)} 2>/dev/null | grep -o "StdOut=[^ ]*" | cut -d= -f2-'


def tunnel_link(ssh: SshMaster, job_id: str) -> str:
    """Last vscode.dev tunnel link the VS Code job printed, or ""."""
    cmd = f'f=$({log_path(job_id)}); [ -n "$f" ] && grep -ao "https://vscode.dev/tunnel/[^ ]*" "$f" | tail -1'
    return ssh.run(cmd, timeout=30).stdout.strip()


def follow_log(job_id: str) -> str:
    """Shell line: report the job state until it runs, then stream its log."""
    j = int(job_id)
    return (f'j={j}; s=; while :; do t=$(squeue -h -j $j -o %T 2>/dev/null); '
            f'[ "$t" != "$s" ] && echo "Job $j: ${{t:-finished}}"; s=$t; '
            f'case "$t" in PENDING|CONFIGURING) sleep 3;; *) break;; esac; done; '
            f'f=$({log_path(job_id)}); '
            f'[ -n "$f" ] && exec tail -n +1 -F "$f"; echo "No log found for job $j"; exec bash -l')


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


def running_jobs(ssh: SshMaster) -> list[Job]:
    res = ssh.run(f'squeue -h -u "$USER" -t RUNNING -o {shlex.quote(JOBS_FORMAT)}')
    if res.returncode != 0:  # an empty answer must mean "no jobs", not "squeue failed"
        raise subprocess.CalledProcessError(res.returncode, "squeue", res.stdout, res.stderr)
    jobs = []
    for line in res.stdout.splitlines():
        parts = line.strip().split("|")
        if len(parts) == 4 and parts[0].isdigit() and parts[2]:
            jobs.append(Job(parts[0], parts[1], parts[2].split(",")[0], parts[3]))
    return jobs


def pick_reusable(jobs: list[Job], partition: str = "") -> Job | None:
    """Prefer a Claude job, then one on our partition, then one we started, then newest."""
    def score(j: Job):
        name = j.name.lower()
        return ("claude" in name, bool(partition) and j.partition == partition,
                name.startswith("hpc-hub"), int(j.job_id))
    return max(jobs, key=score, default=None)
