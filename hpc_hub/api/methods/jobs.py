"""The Jobs page: your jobs, history or all jobs, a job's details, submit a script, and cancel."""

import re
import time
from dataclasses import asdict
from datetime import datetime

from ...compute import jobs, slurm, usage
from ...compute.jobs import JobInfo
from ...connect.session import ClusterSession
from ...terminals import tmux
from ..hub import hub
from ..server import method

ACTIVE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED", "COMPLETING")
CANCELLABLE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED")
USAGE_SECONDS = 300  # account totals change slowly
_usage: dict[str, tuple[float, list[dict]]] = {}  # cluster -> (when, accounts)


def exit_text(code: str) -> str:
    """Slurm's "1:0" (exit code:signal) in words."""
    if not code:
        return ""
    main, _, signal = code.partition(":")
    if signal not in ("", "0"):
        return f"Stopped by signal {signal}"
    if main == "0":
        return "0, finished without errors"
    return f"{main}, the program reported an error"


def su_text(j: JobInfo) -> str:
    """SU = core hours charged. Free QoS (usage factor 0) costs nothing."""
    if j.factor == 0:
        return "free"
    if j.state in ACTIVE:
        return f"{j.su_spent:,.1f} / {j.su_max:,.0f}"
    return f"{j.su_spent:,.1f}"


def job_json(j: JobInfo, me: str) -> dict:
    return {**asdict(j), "from_app": j.from_app, "su_spent": round(j.su_spent, 2), "su_max": round(j.su_max, 2),
            "su": su_text(j), "seconds": jobs.seconds(j.elapsed), "limit_seconds": jobs.seconds(j.limit),
            "elapsed_text": jobs.duration_text(jobs.seconds(j.elapsed)) if j.state != "PENDING" else "",
            "limit_text": jobs.duration_text(jobs.seconds(j.limit)) if jobs.seconds(j.limit) else "no limit",
            "reason": jobs.reason_text(j.where) if j.state == "PENDING" else "", "qos_shown": jobs.shown_qos(j),
            "cancellable": bool(me) and j.user == me and j.state in CANCELLABLE}


def _accounts(s: ClusterSession) -> list[dict]:
    when, got = _usage.get(s.cfg.id, (0.0, []))
    if when and time.monotonic() - when < USAGE_SECONDS:
        return got
    try:
        got = [asdict(a) for a in usage.account_usage(s.ssh)]
        _usage[s.cfg.id] = (time.monotonic(), got)
    except Exception:  # noqa: BLE001 - totals are a nice to have
        pass
    return got


@method("jobs.list")
def list_jobs(cluster: str, scope: str = jobs.MINE) -> dict:
    """Jobs of one scope (mine, group, history, all), newest first, plus the SU totals of your accounts."""
    if scope not in jobs.SCOPES:
        raise ValueError(f"No scope {scope}")
    s = hub().connected(cluster)
    try:
        found = jobs.list_jobs(s.ssh, scope)
    except Exception:
        try:
            lost = not s.healthy()  # the link died, not Slurm: let the cluster card say so
        except Exception:  # noqa: BLE001
            lost = False
        if lost:
            s.mark_lost()
        raise
    me = s.ssh.username
    return {"jobs": [job_json(j, me) for j in found], "user": me, "accounts": _accounts(s),
            "app_job": s.allocation.job_id if s.allocation else ""}


# Slurm's job states in words; a waiting job says why instead
STATES = {"RUNNING": "Running", "COMPLETED": "Finished", "COMPLETING": "Finishing", "FAILED": "Failed",
          "CANCELLED": "Cancelled", "TIMEOUT": "Ran out of time", "OUT_OF_MEMORY": "Ran out of memory",
          "NODE_FAIL": "The node failed", "PREEMPTED": "Stopped for a higher-priority job", "SUSPENDED": "Paused",
          "REQUEUED": "Back in the queue", "BOOT_FAIL": "The node didn't start", "DEADLINE": "Missed its deadline"}


def state_text(state: str, reason: str = "") -> str:
    """"Running", "Ran out of time", "Waiting: higher-priority jobs go first"."""
    if state == "PENDING":
        return jobs.reason_text(f"({reason})") if reason else "Waiting to start"
    word = state.split()[0] if state else ""
    return STATES.get(word, word.capitalize())


def date_text(v: str) -> str:
    """"Oct 24, 09:31" for Slurm's "2026-10-24T09:31:05"."""
    try:
        t = datetime.strptime(v[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        return v.replace("T", " ")[:16]
    return f"{t:%b} {t.day}, {t:%H:%M}"


def mem_text(v: str) -> str:
    """"64 GB" for Slurm's "64G", "500 MB" for "500M", "1.5 TB" for "1536G"."""
    m = re.fullmatch(r"([\d.]+)([KMGT]?)\w*", v.strip())
    if not m:
        return v
    mb = float(m.group(1)) * {"K": 1 / 1024, "M": 1, "G": 1024, "T": 1024 ** 2, "": 1}[m.group(2)]
    for unit, size in (("TB", 1024 ** 2), ("GB", 1024)):
        if mb >= size:
            return f"{mb / size:.1f}".removesuffix(".0") + f" {unit}"
    return f"{mb:.0f} MB"


def detail_groups(d: dict[str, str]) -> list[dict]:
    """The few fields people look at, grouped like the GTK dialog, in words; empty ones left out."""
    def get(*keys: str) -> str:
        for k in keys:
            v = d.get(k, "")
            if v and v not in ("(null)", "None", "N/A", "Unknown"):
                return v
        return ""

    def when(*keys: str) -> str:
        v = get(*keys)
        return date_text(v) if v else ""

    tres = get("AllocTRES", "ReqTRES")
    gpus = re.findall(r"gres/gpu(?::[^=,]+)?=(\d+)", tres)
    mem = re.search(r"mem=([^,]+)", tres)
    state, reason = get("JobState", "State"), get("Reason")
    active = state in ("RUNNING", "PENDING")
    ran, limit = jobs.seconds(get("RunTime", "Elapsed")), jobs.seconds(get("TimeLimit", "Timelimit"))
    if state == "PENDING":
        run_time = f"{jobs.duration_text(limit)} asked" if limit else ""
    else:
        run_time = " of ".join([jobs.duration_text(ran)] + ([jobs.duration_text(limit)] if limit else []))
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
            ("GPUs", str(sum(int(g) for g in gpus)) if gpus else ""),
            ("Queue", queue),
            ("Billing", "" if qos in ("normal", queue) else qos),
            ("Charged to", get("Account")),
        ]),
        ("Files", [
            ("Work folder", get("WorkDir")),
            ("Output", get("StdOut")),
            ("Errors", get("StdErr") if get("StdErr") != get("StdOut") else ""),
        ]),
    ]
    return [{"title": title, "rows": [{"label": k, "value": v} for k, v in rows if v]} for title, rows in groups]


@method("jobs.details")
def details(cluster: str, job_id: str) -> dict:
    """scontrol (or sacct for finished jobs): grouped fields, and the whole text for "All fields"."""
    text = jobs.job_details(hub().connected(cluster).ssh, job_id)
    return {"groups": detail_groups(jobs.parse_details(text)), "text": text}


@method("jobs.inside")
def inside(cluster: str, job_id: str) -> dict:
    """What stops with this job: terminals and agents the app started in it, and the app's own node."""
    s = hub().connected(cluster)
    try:  # the app names them hpchub-<agent>-<job>-...
        titles = [t.title for t in tmux.list_sessions(s.ssh).sessions if f"-{job_id}-" in t.name]
    except Exception:  # noqa: BLE001 - the dialog still works without them
        titles = []
    return {"sessions": titles, "app_node": s.allocation is not None and s.allocation.job_id == job_id}


@method("jobs.submit")
def submit(cluster: str, path: str) -> dict:
    """sbatch the job script at path (on the cluster), from its folder. Answers {job_id}."""
    try:
        return {"job_id": slurm.submit_file(hub().connected(cluster).ssh, path)}
    except slurm.SlurmError as e:
        raise ValueError(str(e)) from e


@method("jobs.cancel")
def cancel(cluster: str, job_id: str) -> dict:
    """scancel, then wait a little for Slurm to drop it. gone False: still stopping."""
    s = hub().connected(cluster)
    jobs.cancel_job(s.ssh, job_id)
    if s.allocation and s.allocation.job_id == job_id:
        s.allocation = None
        s.listener.state_changed(s)
    return {"gone": jobs.wait_gone(s.ssh, job_id)}
