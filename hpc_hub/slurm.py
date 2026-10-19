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


def hours_time(hours: int) -> str:
    """Whole hours as a Slurm time limit: 5 -> 05:00:00, 30 -> 1-06:00:00."""
    days, h = divmod(int(hours), 24)
    return f"{days}-{h:02d}:00:00" if days else f"{h:02d}:00:00"


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


# -- job list ------------------------------------------------------------------

MINE, HISTORY, ALL = "mine", "history", "all"
SQUEUE_FORMAT = "%i|%j|%u|%P|%T|%M|%l|%C|%m|%R|%q"
SACCT_FIELDS = "JobID,JobName,User,Partition,State,Elapsed,Timelimit,AllocCPUS,ReqMem,NodeList,QOS,AllocTRES"
MAX_ROWS = 5000
BILLING, QOS_LIST = "HPCHUB_BILLING", "HPCHUB_QOS"
# billing of my queued jobs (squeue -o has no field for it), and what each QoS charges
BILLING_PART = f"echo {BILLING}; squeue -h -u \"$USER\" -O 'JobID:|,tres-alloc:|' 2>/dev/null"
QOS_PART = f"echo {QOS_LIST}; sacctmgr -n -P show qos format=name,usagefactor 2>/dev/null"


@dataclass
class JobInfo:
    job_id: str
    name: str
    user: str
    partition: str
    state: str
    elapsed: str
    limit: str
    cpus: str
    mem: str
    where: str  # node list, or pending reason
    qos: str = ""
    billing: int = 0  # SU charged per hour (Slurm's billing TRES); 0 = unknown
    factor: float = 1.0  # the QoS usage factor: 0 means free

    @property
    def from_app(self) -> bool:
        return self.name.startswith("hpc-hub")

    def _rate(self) -> float:
        return (self.billing or (int(self.cpus) if self.cpus.isdigit() else 0)) * self.factor / 3600

    @property
    def su_spent(self) -> float:
        return self._rate() * seconds(self.elapsed)

    @property
    def su_max(self) -> float:
        """What the job costs if it runs to its time limit."""
        return self._rate() * seconds(self.limit)


def seconds(text: str) -> int:
    """Slurm durations: 1-02:03:04, 02:03:04, 03:04 (min:sec). Anything else is 0."""
    m = re.fullmatch(r"(?:(\d+)-)?(\d+)(?::(\d+))?(?::(\d+))?", text.strip())
    if not m:
        return 0
    days, a, b, c = (int(x) if x else 0 for x in m.groups())
    if m.group(4) is not None:
        return days * 86400 + a * 3600 + b * 60 + c
    if m.group(3) is not None:
        return days * 86400 + (a * 3600 + b * 60 if m.group(1) else a * 60 + b)
    return days * 86400 + (a * 3600 if m.group(1) else a * 60)


def jobs_command(scope: str, days: int = 7) -> str:
    if scope == HISTORY:
        return (f'sacct -n -P -X -u "$USER" -S now-{int(days)}days '
                f"-o {SACCT_FIELDS} | tail -n {MAX_ROWS}; {QOS_PART}")
    who = "" if scope == ALL else ' -u "$USER"'
    return f"squeue -h{who} -o {shlex.quote(SQUEUE_FORMAT)} | head -n {MAX_ROWS}; {BILLING_PART}; {QOS_PART}"


def _billing(tres: str) -> int:
    m = re.search(r"billing=(\d+)", tres)
    return int(m.group(1)) if m else 0


def parse_jobs(text: str) -> list[JobInfo]:
    jobs, billing, factors, part = [], {}, {}, ""
    for line in text.splitlines():
        line = line.strip()
        if line in (BILLING, QOS_LIST):
            part = line
            continue
        parts = line.split("|")
        if part == BILLING and len(parts) >= 2:
            billing[parts[0]] = _billing(parts[1])
        elif part == QOS_LIST and len(parts) >= 2:
            try:
                factors[parts[0]] = float(parts[1])
            except ValueError:
                pass
        elif not part and len(parts) in (10, 11, 12) and parts[0]:
            parts[4] = parts[4].split()[0] if parts[4] else ""  # "CANCELLED by 123" -> CANCELLED
            job = JobInfo(*parts[:11])
            if len(parts) == 12:
                job.billing = _billing(parts[11])
            jobs.append(job)
    for j in jobs:
        j.billing = j.billing or billing.get(j.job_id, 0)
        j.factor = factors.get(j.qos, 1.0)
    return jobs


def list_jobs(ssh: SshMaster, scope: str, days: int = 7) -> list[JobInfo]:
    res = ssh.run(jobs_command(scope, days), timeout=60)
    if res.returncode != 0 and not res.stdout.strip():
        raise SlurmError(res.stderr.strip() or "Could not list jobs")
    jobs = parse_jobs(res.stdout)
    return sorted(jobs, key=lambda j: _id_key(j.job_id), reverse=True)


def _id_key(job_id: str) -> tuple[int, str]:
    head = re.match(r"\d+", job_id)
    return (int(head.group()) if head else 0, job_id)


def job_details(ssh: SshMaster, job_id: str) -> str:
    if not re.fullmatch(r"[\d_\[\]-]+", job_id):
        raise SlurmError("Bad job id")
    res = ssh.run(f"scontrol show job {job_id} 2>/dev/null || sacct -P -j {job_id} -o ALL", timeout=30)
    return res.stdout.strip() or res.stderr.strip()


FIELD_RE = re.compile(r"([\w/:]+)=(.*?)(?=\s+[\w/:]+=|$)")


def parse_details(text: str) -> dict[str, str]:
    """scontrol show job (Key=Value ...) or sacct -P (header row, value row) into one dict."""
    lines = [x for x in text.splitlines() if x.strip()]
    if len(lines) >= 2 and "|" in lines[0] and "=" not in lines[0]:
        return dict(zip(lines[0].split("|"), lines[1].split("|")))
    out = {}
    for line in lines:
        for key, value in FIELD_RE.findall(line.strip()):
            out[key] = value.strip()
    return out


def wait_gone(ssh: SshMaster, job_id: str, seconds: float = 15) -> bool:
    """After scancel: True once the job no longer runs or waits."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        state = ssh.run(f"squeue -h -j {shlex.quote(job_id)} -o %T 2>/dev/null").stdout.strip()
        if state in ("", "CANCELLED", "COMPLETED"):
            return True
        time.sleep(1.5)
    return False


@dataclass
class AccountUsage:
    account: str
    quota: int  # SU (core hours) the account may use
    used: int  # SU the whole account used
    mine: int  # SU you used in it


USAGE = r"""for a in $(sacctmgr -n -P show assoc where user="$USER" format=account 2>/dev/null | sort -u); do
q=$(sacctmgr -n -P show assoc where account="$a" user="" format=GrpTRESMins 2>/dev/null | grep -o 'billing=[0-9]*' | head -1)
[ -n "$q" ] || continue
u=$(sshare -n -P -A "$a" --users=" " -o GrpTRESRaw 2>/dev/null | grep -o 'billing=[0-9]*' | head -1)
m=$(sshare -n -P -A "$a" --users="$USER" -o User,RawUsage 2>/dev/null | grep "^$USER|" | cut -d'|' -f2)
echo "$a|${q#billing=}|${u#billing=}|$m"
done"""


def parse_usage(text: str) -> list[AccountUsage]:
    out = []
    for line in text.splitlines():
        p = line.strip().split("|")
        if len(p) == 4 and p[1].isdigit():
            num = [int(x) if x.isdigit() else 0 for x in p[1:]]
            out.append(AccountUsage(p[0], num[0] // 60, num[1] // 60, num[2] // 3600))  # minutes, minutes, seconds
    return out


def account_usage(ssh: SshMaster) -> list[AccountUsage]:
    return parse_usage(ssh.run(USAGE, timeout=30).stdout)


def cancel_job(ssh: SshMaster, job_id: str) -> None:
    if not re.fullmatch(r"[\d_\[\]-]+", job_id):
        raise SlurmError("Bad job id")
    res = ssh.run(f"scancel {job_id}")
    if res.returncode != 0:
        raise SlurmError(res.stderr.strip() or "scancel failed")
