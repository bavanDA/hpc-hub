"""Your Slurm jobs: find them, read their state and node, cancel them."""

import shlex
import subprocess
import time
from dataclasses import dataclass

from ..core.ssh import SshMaster

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


def find_job(ssh: SshMaster, names: list[str]) -> Job | None:
    res = ssh.run(f'squeue -h -u "$USER" -t PENDING,RUNNING -n {shlex.quote(",".join(names))} '
                  f"-o {shlex.quote(JOBS_FORMAT)}")
    jobs = [Job(*parts) for line in res.stdout.splitlines()
            if len(parts := line.strip().split("|")) == 4 and parts[0].isdigit()]
    return max(jobs, key=lambda j: int(j.job_id), default=None)


def default_account(ssh: SshMaster) -> str:
    """Your default Slurm account (some clusters, like Expanse, still want it named on every job)."""
    out = ssh.run('sacctmgr -nP show user "$USER" format=defaultaccount 2>/dev/null').stdout.split()
    return out[0] if out else ""


def resources(ssh: SshMaster, job_id: str) -> str:
    """What the job has, e.g. "16 cores · 64G · 1:23:45 of 12:00:00"."""
    out = ssh.run(f"squeue -h -j {int(job_id)} -o '%C|%m|%M|%l'").stdout.strip().split("|")
    if len(out) != 4:
        return ""
    cores, mem, used, limit = out
    return f"{cores} cores · {mem} · {used} of {limit}"


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
