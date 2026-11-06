"""The backup's trial run and copy, as Slurm jobs. A copy needs a trial run of the same plan, and a plan that
does not fit is refused."""

from dataclasses import asdict

from ...backup import copy, plan, scan
from ..hub import hub
from ..server import method
from .backup import _cached_summary, _fetch, _fetch_json, _job_id, _run, _ssh
from .backup_plan import made_plan


def _job(kind: str, cluster: str, scan_id: str, p: plan.Plan) -> str:
    s = hub().connected(cluster)
    data = _cached_summary(cluster, scan_id)
    to_home = any(r.get("to") == "home" and r.get("keep") for r in p.rules)
    home = next((plan.dest_path(d["path"]) for d in data.get("destinations", []) if d.get("label") == "Home"), "")
    return copy.script(kind, scan_id, data.get("scratch", ""), p.dest, home if to_home else "", p.hash,
                       s.cfg.profile, cluster_id=s.cfg.id, hardlinks=bool(data.get("hardlinks")),
                       total_bytes=p.bytes)


@method("backup.dry_run")
def dry_run(cluster: str, id: str) -> dict:
    """The exact files and bytes, and what would be replaced. Nothing is copied."""
    p = made_plan(cluster, id)
    out = _run(_ssh(cluster), copy.start_command(id, "dry", _job("dry", cluster, id, p), plan.rules_json(p)))
    return {"job_id": _job_id(out)}


@method("backup.start")
def start(cluster: str, id: str, confirm: str) -> dict:
    """Copy the plan the trial run checked. confirm: that plan's hash, as the app showed it."""
    p = made_plan(cluster, id)
    if confirm != p.hash:
        raise RuntimeError("The plan changed. Try it first again.")
    if p.space and not p.space.fits:
        raise RuntimeError(p.space.warn or "This does not fit in project.")
    if _fetch_json(cluster, id, "dry.json").get("hash") != p.hash:
        raise RuntimeError("Try it first.")
    out = _run(_ssh(cluster), copy.start_command(id, "copy", _job("copy", cluster, id, p)))
    return {"copy_id": id, "job_id": _job_id(out)}


@method("backup.progress")
def progress(cluster: str, copy_id: str) -> dict:
    return asdict(copy.parse_progress(_run(_ssh(cluster), copy.progress_command(scan.check_id(copy_id)))))


@method("backup.result")
def result(cluster: str, copy_id: str) -> dict:
    return asdict(copy.parse_result(_fetch(cluster, copy_id, "result.json")))


@method("backup.cancel")
def cancel(cluster: str, id: str) -> dict:
    """Stop the scan, trial run or copy. Files already copied stay in project."""
    _ssh(cluster).run(copy.cancel_command(scan.check_id(id)) + "; " + scan.cancel_command(id), timeout=60)
    return {}
