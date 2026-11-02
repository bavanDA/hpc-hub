"""Job list for the Jobs tab: my jobs, history or all, details, and cancel."""

import re
import shlex
import time
from dataclasses import dataclass

from ..core.ssh import SshMaster
from .slurm import SlurmError

MINE, HISTORY, ALL, GROUP = "mine", "history", "all", "group"
SCOPES = (MINE, GROUP, HISTORY, ALL)
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


# The Slurm accounts you're in, comma separated: "My group" shows every job charged to them
MY_ACCOUNTS = 'a=$(sacctmgr -n -P show assoc user="$USER" format=account 2>/dev/null | sort -u | paste -sd, -); '


def jobs_command(scope: str, days: int = 7, account: str = "") -> str:
    """account: with the group scope, only that group's jobs."""
    if scope == HISTORY:
        return (f'sacct -n -P -X -u "$USER" -S now-{int(days)}days '
                f"-o {SACCT_FIELDS} | tail -n {MAX_ROWS}; {QOS_PART}")
    if scope == GROUP and account:
        return (f"squeue -h -A {shlex.quote(account)} -o {shlex.quote(SQUEUE_FORMAT)} | head -n {MAX_ROWS}; "
                f"{BILLING_PART}; {QOS_PART}")
    if scope == GROUP:  # no accounts found: just yours
        return (f'{MY_ACCOUNTS}squeue -h $([ -n "$a" ] && echo "-A $a" || echo "-u $USER") '
                f"-o {shlex.quote(SQUEUE_FORMAT)} | head -n {MAX_ROWS}; {BILLING_PART}; {QOS_PART}")
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


def list_jobs(ssh: SshMaster, scope: str, days: int = 7, account: str = "") -> list[JobInfo]:
    res = ssh.run(jobs_command(scope, days, account), timeout=60)
    if res.returncode != 0 and not res.stdout.strip():
        raise SlurmError(res.stderr.strip() or "Could not list jobs")
    jobs = parse_jobs(res.stdout)
    return sorted(jobs, key=lambda j: _id_key(j.job_id), reverse=True)


def _id_key(job_id: str) -> tuple[int, str]:
    head = re.match(r"\d+", job_id)
    return (int(head.group()) if head else 0, job_id)


def _check_id(job_id: str) -> None:
    if not re.fullmatch(r"[\d_\[\]-]+", job_id):
        raise SlurmError("Bad job id")


def job_details(ssh: SshMaster, job_id: str) -> str:
    _check_id(job_id)
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


def duration_text(total: int) -> str:
    """How a time reads in the app: "3 days", "1 day 2 h", "4 h", "1 h 12 min", "12 min", "under 1 min"."""
    days, rest = divmod(max(0, int(total)), 86400)
    h, rest = divmod(rest, 3600)
    m = rest // 60
    if days:
        return f"{days} day{'s' if days > 1 else ''}" + (f" {h} h" if h else "")
    if h:
        return f"{h} h" + (f" {m} min" if m else "")
    return f"{m} min" if m else "under 1 min"


# Slurm's pending reasons, in words: (prefix of the reason, what it means)
REASONS = [
    ("Priority", "Waiting: higher-priority jobs go first"),
    ("Resources", "Waiting: not enough free nodes yet"),
    ("DependencyNeverSatisfied", "Won't start: the job it waits for failed"),
    ("Dependency", "Waiting for another job to finish"),
    ("BeginTime", "Waiting for its start time"),
    ("JobHeldUser", "On hold by you"),
    ("JobHeldAdmin", "On hold by the admins"),
    ("launch failed requeued held", "Held after a failed start"),
    ("ReqNodeNotAvail", "Waiting: the nodes it needs are down or reserved"),
    ("Reservation", "Waiting for its reservation"),
    ("PartitionTimeLimit", "Won't start: longer than this queue allows"),
    ("PartitionNodeLimit", "Won't start: more nodes than this queue allows"),
    ("PartitionDown", "Waiting: this queue is down"),
    ("PartitionInactive", "Waiting: this queue is closed"),
    ("QOSMaxJobsPerUser", "Waiting: you have the most jobs allowed running"),
    ("QOSMaxSubmitJobPerUser", "Waiting: you have the most jobs allowed running"),
    ("AssocMaxJobs", "Waiting: you have the most jobs allowed running"),
    ("QOSMaxCpuPerUser", "Waiting: you're using the most cores allowed"),
    ("QOSMaxGRESPerUser", "Waiting: you're using the most GPUs allowed"),
    ("AssocGrpBilling", "Waiting: your group is out of SUs"),
    ("QOSGrpBilling", "Waiting: your group is out of SUs"),
    ("AssocGrp", "Waiting: your group is at its limit"),
    ("QOSGrp", "Waiting: this queue is at its limit"),
    ("Nodes required for job are DOWN", "Waiting: the nodes it needs are down"),
]


def reason_text(where: str) -> str:
    """The pending reason in plain words ("(Priority)" -> "Waiting: higher-priority jobs go first"); "" for none."""
    raw = where.strip()
    if not (raw.startswith("(") and raw.endswith(")")):
        return ""
    raw = raw[1:-1].strip()
    if raw in ("", "None", "null"):
        return "Waiting to start"
    for prefix, text in REASONS:
        if raw.startswith(prefix):
            return text
    return f"Waiting: {raw}"


def shown_qos(j: JobInfo) -> str:
    """The QoS, when it tells you something: not the usual one (empty, "normal" or the queue's own name)."""
    return "" if j.qos in ("", "normal", j.partition) else j.qos


def priority_name(qos: str) -> str:
    """Slurm's QoS as a priority in words: "Low", "Standard", "High (mygroup)" for low, standard, high_mygroup
    (app/src/components/clusters/queues.tsx priorityName)."""
    if qos.startswith("high_"):
        return f"High ({qos[5:]})"
    return qos[:1].upper() + qos[1:].replace("_", " ")


def ran_for(elapsed: str) -> str:
    """"3 h 41 min" for Slurm's "3:41:10", "1 d 2 h" for "1-02:00:00", "12 min" for "12:30"."""
    days, _, hms = elapsed.rpartition("-")
    parts = [int(x) if x.isdigit() else 0 for x in hms.split(":")]
    h, m = (parts[0], parts[1]) if len(parts) == 3 else (0, parts[0])
    d = int(days) if days.isdigit() else 0
    if d:
        return f"{d} d" + (f" {h} h" if h else "")
    if h:
        return f"{h} h" + (f" {m} min" if m else "")
    return f"{m or 1} min"


def wait_gone(ssh: SshMaster, job_id: str, seconds: float = 15) -> bool:
    """After scancel: True once the job no longer runs or waits."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        state = ssh.run(f"squeue -h -j {shlex.quote(job_id)} -o %T 2>/dev/null").stdout.strip()
        if state in ("", "CANCELLED", "COMPLETED"):
            return True
        time.sleep(1.5)
    return False


def cancel_job(ssh: SshMaster, job_id: str) -> None:
    _check_id(job_id)
    res = ssh.run(f"scancel {job_id}")
    if res.returncode != 0:
        raise SlurmError(res.stderr.strip() or "scancel failed")
