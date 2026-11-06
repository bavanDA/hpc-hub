import time
from dataclasses import asdict

from ...compute import job_text, jobs, slurm
from ...compute.jobs import JobInfo
from ...compute.usage.accounts import account_usage
from ...connect.session import ClusterSession
from ...terminals import tmux
from ..hub import hub
from ..server import method

ACTIVE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED", "COMPLETING")
CANCELLABLE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED")
USAGE_SECONDS = 300  # account totals change slowly
_usage: dict[str, tuple[float, list[dict]]] = {}  # cluster -> (when, accounts)


def su_text(j: JobInfo) -> str:
    """SU = core hours charged. Free QoS (usage factor 0) costs nothing."""
    if j.factor == 0:
        return "free"
    if j.state in ACTIVE:
        return f"{j.su_spent:,.1f} / {j.su_max:,.0f}"
    return f"{j.su_spent:,.1f}"


def job_json(j: JobInfo, me: str) -> dict:
    ran, limit, pending = jobs.seconds(j.elapsed), jobs.seconds(j.limit), j.state == "PENDING"
    return {**asdict(j), "from_app": j.from_app, "su_spent": round(j.su_spent, 2), "su_max": round(j.su_max, 2),
            "su": su_text(j), "seconds": ran, "limit_seconds": limit,
            "elapsed_text": "" if pending else job_text.duration_text(ran),
            "limit_text": job_text.duration_text(limit) if limit else "no limit",
            "reason": job_text.reason_text(j.where) if pending else "", "qos_shown": job_text.shown_qos(j),
            "cancellable": bool(me) and j.user == me and j.state in CANCELLABLE}


def _accounts(s: ClusterSession) -> list[dict]:
    when, got = _usage.get(s.cfg.id, (0.0, []))
    if when and time.monotonic() - when < USAGE_SECONDS:
        return got
    try:
        got = [asdict(a) for a in account_usage(s.ssh)]
        _usage[s.cfg.id] = (time.monotonic(), got)
    except Exception:  # noqa: BLE001 - totals are a nice to have
        pass
    return got


@method("jobs.list")
def list_jobs(cluster: str, scope: str = jobs.MINE, account: str = "") -> dict:
    """Jobs of one scope (mine, group, history, all), newest first, plus the SU totals of your accounts. account:
    one of your groups (groups) for the group scope; none means all of them."""
    if scope not in jobs.SCOPES:
        raise ValueError(f"No scope {scope}")
    s = hub().connected(cluster)
    try:
        found = jobs.list_jobs(s.ssh, scope, account=account.strip())
    except Exception:
        try:
            lost = not s.healthy()  # the link died, not Slurm: let the cluster card say so
        except Exception:  # noqa: BLE001
            lost = False
        if lost:
            s.mark_lost()
        raise
    me = s.ssh.username
    lim = getattr(s, "limits", None)
    groups = sorted(lim.account_qos) if lim else []
    return {"jobs": [job_json(j, me) for j in found], "user": me, "accounts": _accounts(s), "groups": groups,
            "app_job": s.allocation.job_id if s.allocation else ""}


@method("jobs.details")
def details(cluster: str, job_id: str) -> dict:
    """scontrol (or sacct for finished jobs): grouped fields, and the whole text for "All fields"."""
    text = jobs.job_details(hub().connected(cluster).ssh, job_id)
    return {"groups": job_text.detail_groups(jobs.parse_details(text), cluster), "text": text}


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
