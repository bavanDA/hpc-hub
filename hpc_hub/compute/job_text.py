"""Slurm job fields in plain words, as the Jobs page shows them."""

import re
from datetime import datetime

from . import gpus
from .jobs import JobInfo, seconds

# (prefix of the pending reason, what it means)
REASONS = [
    ("Priority", "Waiting: higher-priority jobs go first"),
    ("Resources", "Waiting: not enough free nodes yet"),
    ("DependencyNeverSatisfied", "Won't start: the job it waits for failed"),
    ("Dependency", "Waiting for another job to finish"),
    ("BeginTime", "Waiting for its start time"),
    ("JobHeldUser", "On hold by you"),
    ("JobHeldAdmin", "On hold by the admins"),
    ("launch failed requeued held", "Held after a failed start"),
    ("ReqNodeNotAvail, Reserved for maintenance", "Waiting: maintenance has to finish first"),
    ("ReqNodeNotAvail", "Waiting: its nodes are down or reserved"),
    ("Reservation", "Waiting for its reservation"),
    ("PartitionTimeLimit", "Won't start: longer than this queue allows"),
    ("PartitionNodeLimit", "Won't start: more nodes than this queue allows"),
    ("PartitionDown", "Waiting: this queue is down"),
    ("PartitionInactive", "Waiting: this queue is closed"),
    ("QOSMaxJobsPerUser", "Waiting: one of your jobs must end first"),
    ("QOSMaxSubmitJobPerUser", "Waiting: one of your jobs must end first"),
    ("AssocMaxJobs", "Waiting: one of your jobs must end first"),
    ("QOSMaxCpuPerUser", "Waiting: at your core limit"),
    ("QOSMaxGRESPerUser", "Waiting: at your GPU limit"),
    ("AssocGrpBilling", "Waiting: your group is out of SUs"),
    ("QOSGrpBilling", "Waiting: your group is out of SUs"),
    ("AssocGrp", "Waiting: your group is at its limit"),
    ("QOSGrp", "Waiting: this queue is at its limit"),
    ("Nodes required for job are DOWN", "Waiting: its nodes are down"),
]

STATES = {"RUNNING": "Running", "COMPLETED": "Finished", "COMPLETING": "Finishing", "FAILED": "Failed",
          "CANCELLED": "Cancelled", "TIMEOUT": "Ran out of time", "OUT_OF_MEMORY": "Ran out of memory",
          "NODE_FAIL": "The node failed", "PREEMPTED": "Stopped for a higher-priority job", "SUSPENDED": "Paused",
          "REQUEUED": "Back in the queue", "BOOT_FAIL": "The node didn't start", "DEADLINE": "Missed its deadline"}

EMPTY = ("(null)", "None", "N/A", "Unknown")


def duration_text(total: int) -> str:
    """"3 days", "1 day 2 h", "4 h", "1 h 12 min", "12 min", "under 1 min"."""
    days, rest = divmod(max(0, int(total)), 86400)
    h, rest = divmod(rest, 3600)
    m = rest // 60
    if days:
        return f"{days} day{'s' if days > 1 else ''}" + (f" {h} h" if h else "")
    if h:
        return f"{h} h" + (f" {m} min" if m else "")
    return f"{m} min" if m else "under 1 min"


def reason_text(where: str) -> str:
    """squeue's "(Priority)" in words; "" when where is a node list."""
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


def state_text(state: str, reason: str = "") -> str:
    if state == "PENDING":
        return reason_text(f"({reason})") if reason else "Waiting to start"
    word = state.split()[0] if state else ""  # "CANCELLED by 123"
    return STATES.get(word, word.capitalize())


def shown_qos(j: JobInfo) -> str:
    """The QoS unless it is the usual one (empty, "normal" or the queue's own name)."""
    return "" if j.qos in ("", "normal", j.partition) else j.qos


def priority_name(qos: str) -> str:
    """low, standard, high_mygroup -> "Low", "Standard", "High (mygroup)", as clusters/priority.ts does."""
    if qos.startswith("high_"):
        return f"High ({qos[5:]})"
    return qos[:1].upper() + qos[1:].replace("_", " ")


def exit_text(code: str) -> str:
    """Slurm's exit code:signal in words."""
    if not code:
        return ""
    main, _, signal = code.partition(":")
    if signal not in ("", "0"):
        return f"Stopped by signal {signal}"
    if main == "0":
        return "0, finished without errors"
    return f"{main}, the program reported an error"


def date_text(v: str) -> str:
    """"Oct 24, 09:31" for "2026-10-24T09:31:05"."""
    try:
        t = datetime.strptime(v[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        return v.replace("T", " ")[:16]
    return f"{t:%b} {t.day}, {t:%H:%M}"


def mem_text(v: str) -> str:
    """"64 GB" for "64G", "500 MB" for "500M", "1.5 TB" for "1536G"."""
    m = re.fullmatch(r"([\d.]+)([KMGT]?)\w*", v.strip())
    if not m:
        return v
    mb = float(m.group(1)) * {"K": 1 / 1024, "M": 1, "G": 1024, "T": 1024 ** 2, "": 1}[m.group(2)]
    for unit, size in (("TB", 1024 ** 2), ("GB", 1024)):
        if mb >= size:
            return f"{mb / size:.1f}".removesuffix(".0") + f" {unit}"
    return f"{mb:.0f} MB"


def detail_groups(d: dict[str, str], cluster_id: str = "") -> list[dict]:
    """The fields people look at, from scontrol or sacct, grouped; empty ones left out."""
    def get(*keys: str) -> str:
        return next((d[k] for k in keys if d.get(k) and d[k] not in EMPTY), "")

    def when(*keys: str) -> str:
        v = get(*keys)
        return date_text(v) if v else ""

    tres = get("AllocTRES", "ReqTRES")
    mem = re.search(r"mem=([^,]+)", tres)
    state, reason = get("JobState", "State"), get("Reason")
    active = state in ("RUNNING", "PENDING")
    ran, limit = seconds(get("RunTime", "Elapsed")), seconds(get("TimeLimit", "Timelimit"))
    if state == "PENDING":
        run_time = f"{duration_text(limit)} asked" if limit else ""
    else:
        run_time = " of ".join([duration_text(ran)] + ([duration_text(limit)] if limit else []))
    queue, qos = get("Partition"), get("QOS")
    groups = [
        ("Status", [
            ("State", state_text(state, reason)),
            ("Run time", run_time),
            ("Started", when("StartTime", "Start")),
            ("Ends" if active else "Ended", when("EndTime", "End")),
            ("Submitted", when("SubmitTime", "Submit")),
            ("Exit code", "" if active else exit_text(get("ExitCode"))),
        ]),
        ("Resources", [
            ("Node", get("NodeList")),
            ("Cores", get("NumCPUs", "AllocCPUS")),
            ("Memory", mem_text(mem.group(1) if mem else get("ReqMem"))),
            ("GPU", gpus.amount(tres, cluster_id)),
            ("Queue", queue),
            ("Priority", "" if qos in ("", "normal", queue) else priority_name(qos)),
            ("Charged to", get("Account")),
        ]),
        ("Files", [
            ("Work folder", get("WorkDir")),
            ("Output", get("StdOut")),
            ("Errors", get("StdErr") if get("StdErr") != get("StdOut") else ""),
        ]),
    ]
    return [{"title": title, "rows": [{"label": k, "value": v} for k, v in rows if v]} for title, rows in groups]
