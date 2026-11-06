"""Batch jobs: sbatch a script, and ask Slurm how long one would wait."""

import re
import shlex

from ..core.config import ComputeProfile
from ..core.ssh import SshMaster
from .slurm import SlurmError
from .slurm_args import checked, resource_args

BATCH_DIR = ".hpc-hub"  # under $HOME on the cluster


def batch_script(p: ComputeProfile, job_name: str, body: str) -> str:
    """Script for sbatch; the log lands in ~/.hpc-hub/<name>-<job>.out."""
    lines = ["#!/bin/bash -l", f"#SBATCH --job-name={job_name}", f"#SBATCH --output={job_name}-%j.out"]
    lines += [f"#SBATCH {a}" for a in resource_args(p)]
    return "\n".join(lines + ["", body, ""])


def submit(ssh: SshMaster, p: ComputeProfile, job_name: str, body: str) -> str:
    """sbatch the script (sent on stdin, no temp file), return the job id."""
    checked(p)
    script = batch_script(p, job_name, body)
    cmd = (f'mkdir -p "$HOME/{BATCH_DIR}" && cd "$HOME/{BATCH_DIR}" && '
           f"printf %s {shlex.quote(script)} | sbatch --parsable")
    res = ssh.run(cmd, timeout=60)
    job_id = res.stdout.strip().split(";")[0]
    if res.returncode != 0 or not job_id.isdigit():
        raise SlurmError(res.stderr.strip() or res.stdout.strip() or "sbatch failed")
    return job_id


SUBMITTED = re.compile(r"Submitted batch job (\d+)")


def submit_file(ssh: SshMaster, path: str) -> str:
    """sbatch a script that is on the cluster, from its own folder (so its relative paths work). The job id."""
    path = path.strip()
    if not path:
        raise SlurmError("Open a job script first")
    word = f'"$HOME"/{shlex.quote(path[2:])}' if path.startswith("~/") else shlex.quote(path)
    res = ssh.run(f'f={word}; cd "$(dirname -- "$f")" && sbatch -- "$(basename -- "$f")"', timeout=60)
    m = SUBMITTED.search(res.stdout)
    if res.returncode != 0 or not m:
        raise SlurmError(res.stderr.strip() or res.stdout.strip() or "sbatch failed")
    return m.group(1)


def wait_seconds(ssh: SshMaster, p: ComputeProfile) -> int | None:
    """How long Slurm thinks a job like this waits before it starts (sbatch --test-only: nothing is submitted).
    None if Slurm would refuse it or gives no estimate."""
    args = " ".join(shlex.quote(a) for a in resource_args(p))
    cmd = (f"out=$(sbatch --test-only {args} --wrap=true 2>&1); "
           "s=$(printf %s \"$out\" | grep -o 'start at [0-9T:-]*' | cut -d' ' -f3); "
           '[ -n "$s" ] && echo $(( $(date -d "$s" +%s) - $(date +%s) ))')
    out = ssh.run(cmd, timeout=60).stdout.strip()
    return max(0, int(out)) if out.lstrip("-").isdigit() else None


def human_wait(seconds: int) -> str:
    if seconds < 90:
        return "now"
    for unit, size in (("days", 86400), ("h", 3600), ("min", 60)):
        if seconds >= size:
            return f"{seconds / size:.0f} {unit}" if unit != "days" else f"{seconds / size:.1f} days"
    return "now"
