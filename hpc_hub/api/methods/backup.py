"""The backup agent (hpc_hub/backup): find what scratch's timer is about to delete, plan what to keep, try it,
copy it to project and check it. The scan, the trial run and the copy are Slurm jobs whose files live in
~/.hpc-hub/backup/<id>/ on the cluster, so they go on with the app closed; the app keeps only the plans it made.

Order is enforced: a copy needs a trial run of the same plan, and a plan that doesn't fit is refused."""

import json
import shlex
import threading
from dataclasses import asdict

from ...agents import catalog, schedules
from ...backup import agent as backup_agent
from ...backup import copy, plan, policy, remind, scan
from ...backup.model import Destination
from ...compute import usage
from ...files import remote_fs
from ..hub import hub
from ..server import method

GB = 1024 ** 3
_plans: dict[tuple[str, str], plan.Plan] = {}
_summaries: dict[str, dict] = {}  # cluster -> the newest summary fetched, for alerts without a new scan
_lock = threading.Lock()


def _ssh(cluster: str):
    return hub().connected(cluster).ssh


def _run(ssh, command: str, timeout: int = 120) -> str:
    res = ssh.run(command, timeout=timeout)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "The cluster said no").strip().splitlines()[-1])
    return res.stdout


def _row_for(rows: list[usage.Storage], kind: str) -> usage.Storage | None:
    for r in rows:
        if kind == "home" and r.label == "Home" or kind != "home" and kind in r.label.lower():
            return r
    return None


def _policy(cluster: str) -> dict:
    """Scratch, the purge rule and where copies can go, with their space."""
    s = hub().connected(cluster)
    rows, _ = usage.storage(s.ssh, s.cfg.profile.account)
    found = remote_fs.storage(remote_fs.places(s.ssh))
    scratch_row = _row_for(rows, "scratch")
    purge = policy.resolve(s.cfg.id)
    if scratch_row and scratch_row.purged:
        purge.days, purge.from_cluster = scratch_row.purged, True
    scratch = next((p.path for p in found if p.label.startswith("Scratch")), "")
    dests = []
    for p in found:
        kind = "project" if p.label.startswith("Project") else "home" if p.label == "Home" else ""
        if not kind:
            continue
        r = _row_for(rows, kind)
        used, quota = (float(r.used), float(r.quota)) if r else (0.0, 0.0)
        dests.append(Destination(path=p.path, label=p.label, used_gb=used, quota_gb=quota,
                                 free_gb=max(quota - used, 0.0) if quota else 0.0,
                                 files=r.files if r else 0, file_limit=r.file_limit if r else 0,
                                 shared_with=len(r.people) if r else 0, backed_up=bool(r and r.backup == "Yes")))
    fill = int(100 * scratch_row.used / scratch_row.quota) if scratch_row and scratch_row.quota else 0
    return {"scratch": scratch, "destinations": [asdict(d) for d in dests], "purge": asdict(purge),
            "scratch_fill_pct": fill, "files_in_scratch": scratch_row.files if scratch_row else 0,
            "no_tricks": policy.NO_TRICKS}


@method("backup.policy")
def get_policy(cluster: str) -> dict:
    return _policy(cluster)


@method("backup.scan")
def start_scan(cluster: str, horizon_days: int = 14, group: bool = False, agent: str = "") -> dict:
    """Start a scan job; answers its id and job id. agent: also let that agent sort the folders."""
    s = hub().connected(cluster)
    pol = _policy(cluster)
    if not pol["scratch"]:
        raise RuntimeError(f"No scratch folder found on {s.cfg.name}")
    purge = policy.Purge(**pol["purge"])
    cmd = ""
    if agent:
        if agent not in catalog.BY_ID:
            raise ValueError(f"No agent {agent}")
        cmd = backup_agent.agent_command(catalog.BY_ID[agent], getattr(s.cfg, agent))
    scan_id = scan.new_id()
    job = scan.script(scan_id, pol["scratch"], purge, int(horizon_days), scan.job_profile(s.cfg.profile, s.cfg.id),
                      group=bool(group), expected=pol["files_in_scratch"], agent_cmd=cmd)
    meta = {"id": scan_id, "cluster": s.cfg.id, "scratch": pol["scratch"], "horizon": int(horizon_days),
            "group": bool(group), "agent": agent, "policy": pol}
    out = _run(s.ssh, scan.start_command(scan_id, meta, job))
    return {"id": scan_id, "job_id": _job_id(out)}


def _job_id(out: str) -> str:
    """sbatch --parsable prints "id" or "id;cluster" as its last line."""
    return out.strip().splitlines()[-1].split(";")[0] if out.strip() else ""


@method("backup.scans")
def scans(cluster: str, limit: int = 10) -> list[dict]:
    return scan.parse_list(_run(_ssh(cluster), scan.list_command(int(limit))))


def _fetch(cluster: str, scan_id: str, name: str) -> str:
    return _ssh(cluster).run(scan.fetch_command(scan.check_id(scan_id), name), timeout=120).stdout


def _summary(cluster: str, scan_id: str) -> dict:
    text = _fetch(cluster, scan_id, "summary.json")
    if not text.strip():
        raise RuntimeError("The scan has no results yet")
    data = json.loads(text)
    meta = next((m for m in scans(cluster, 50) if m.get("id") == scan_id), {})
    pol = meta.get("policy") or _policy(cluster)  # a scheduled check saved no policy: ask the cluster now
    data["purge"] = {**data.get("purge", {}), **pol.get("purge", {})}
    data["scratch_fill_pct"] = pol.get("scratch_fill_pct", 0)
    data["destinations"] = pol.get("destinations", [])
    with _lock:
        _summaries[cluster] = data
    return data


@method("backup.summary")
def summary(cluster: str, id: str) -> dict:
    return _summary(cluster, id)


def _choices(cluster: str) -> list:
    text = _ssh(cluster).run(f'cat "$HOME"/{scan.ROOT}/choices.json 2>/dev/null', timeout=60).stdout
    try:
        data = json.loads(text) if text.strip() else []
    except ValueError:
        data = []
    return data if isinstance(data, list) else []


def _save_choices(cluster: str, choices: list) -> None:
    body = shlex.quote(json.dumps(choices))
    _run(_ssh(cluster), f'mkdir -p "$HOME"/{scan.ROOT} && printf %s {body} > "$HOME"/{scan.ROOT}/choices.json')


@method("backup.plan")
def make_plan(cluster: str, id: str, horizon_days: int | None = None, scope: str = "at_risk",
              whole_folders: bool = True, code_to_home: bool = False, dest: str = "",
              changes: list | None = None) -> dict:
    """What to copy and why, where to, and what it does to the space there. changes: [{path, class?, keep}]
    from you, kept for later scans too."""
    data = _summary(cluster, id)
    dests = [Destination(**d) for d in data.get("destinations", [])]
    if not dests:
        raise RuntimeError("No project folder found to copy into")
    projects = [d for d in dests if d.label != "Home"] or dests
    target = projects[0]
    if dest:
        plan.check_dest(dest, dests, data.get("scratch", ""))
        target = next(d for d in dests if plan.dest_path(d.path) == dest)
    home = next((d for d in dests if d.label == "Home"), None)
    choices = _choices(cluster)
    if changes:
        merged = {(c.get("path"), c.get("class") or ""): c for c in choices}
        for c in changes:
            if isinstance(c, dict) and c.get("path") and isinstance(c.get("keep"), bool):
                merged[(c["path"], c.get("class") or "")] = {"path": c["path"], "class": c.get("class") or "",
                                                            "keep": c["keep"]}
        choices = list(merged.values())
        _save_choices(cluster, choices)
    agent = backup_agent.validate(_fetch(cluster, id, "plan.agent.json") or "{}",
                                  [f["path"] for f in data.get("folders", [])])
    p = plan.build(data, target, horizon=horizon_days, scope=scope, whole_folders=whole_folders, agent=agent,
                   choices=choices, home=home, code_to_home=code_to_home)
    dry = _fetch(cluster, id, "dry.json")
    try:
        d = json.loads(dry) if dry.strip() else {}
    except ValueError:
        d = {}
    if d.get("hash") == p.hash:
        p.exact, p.files, p.bytes = True, d.get("files", p.files), d.get("bytes", p.bytes)
        p.space = plan.space(target, p.bytes, p.files)
    with _lock:
        _plans[(cluster, id)] = p
    out = plan.to_dict(p)
    out["will_replace"] = d.get("will_replace", 0) if p.exact else 0
    out["busy"] = d.get("busy", []) if p.exact else []
    return out


def _plan(cluster: str, scan_id: str) -> plan.Plan:
    with _lock:
        p = _plans.get((cluster, scan.check_id(scan_id)))
    if p is None:
        raise RuntimeError("Make the plan first")
    return p


def _job_args(cluster: str, scan_id: str, p: plan.Plan) -> dict:
    data = _summaries.get(cluster) if _summaries.get(cluster, {}).get("id") == scan_id else _summary(cluster, scan_id)
    home = next((plan.dest_path(d["path"]) for d in data.get("destinations", []) if d.get("label") == "Home"), "")
    home = home if any(r.get("to") == "home" and r.get("keep") for r in p.rules) else ""
    return {"scratch": data.get("scratch", ""), "home": home, "hardlinks": bool(data.get("hardlinks"))}


@method("backup.dry_run")
def dry_run(cluster: str, id: str) -> dict:
    """The trial run: the exact files and bytes, and what would be replaced. Nothing is copied."""
    s = hub().connected(cluster)
    p = _plan(cluster, id)
    a = _job_args(cluster, id, p)
    job = copy.script("dry", id, a["scratch"], p.dest, a["home"], p.hash, s.cfg.profile, cluster_id=s.cfg.id,
                      hardlinks=a["hardlinks"], total_bytes=p.bytes)
    out = _run(s.ssh, copy.start_command(id, "dry", job, plan.rules_json(p)))
    return {"job_id": _job_id(out)}


@method("backup.start")
def start(cluster: str, id: str, confirm: str) -> dict:
    """Copy the plan the trial run checked. confirm: that plan's hash, as the app showed it."""
    s = hub().connected(cluster)
    p = _plan(cluster, id)
    if confirm != p.hash:
        raise RuntimeError("The plan changed. Try it first again.")
    if p.space and not p.space.fits:
        raise RuntimeError(p.space.warn or "This does not fit in project.")
    dry = _fetch(cluster, id, "dry.json")
    try:
        tried = json.loads(dry).get("hash") if dry.strip() else ""
    except ValueError:
        tried = ""
    if tried != p.hash:
        raise RuntimeError("Try it first.")
    a = _job_args(cluster, id, p)
    job = copy.script("copy", id, a["scratch"], p.dest, a["home"], p.hash, s.cfg.profile, cluster_id=s.cfg.id,
                      hardlinks=a["hardlinks"], total_bytes=p.bytes)
    out = _run(s.ssh, copy.start_command(id, "copy", job))
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
    ssh = _ssh(cluster)
    ssh.run(copy.cancel_command(scan.check_id(id)) + "; " + scan.cancel_command(id), timeout=60)
    return {}


def _reminder(cluster: str) -> schedules.Status | None:
    return next((st for st in schedules.list_schedules(_ssh(cluster)) if st.schedule.name == remind.NAME), None)


@method("backup.reminders")
def reminders(cluster: str) -> dict:
    st = _reminder(cluster)
    if st is None:
        return {"enabled": False, "days": remind.DEFAULT_DAYS, "time": remind.DEFAULT_TIME, "horizon_days": 14}
    o = remind.options(st.schedule)
    return {"enabled": st.schedule.enabled, "days": st.schedule.days, "time": st.schedule.time,
            "horizon_days": o.get("horizon", 14), "next": st.start}


@method("backup.set_reminders")
def set_reminders(cluster: str, enabled: bool, days: list[int] | None = None, time: str = remind.DEFAULT_TIME,
                  horizon_days: int = 14) -> dict:
    """Check scratch on these days (1 = Monday) at this time, as a scheduled job on the cluster."""
    s = hub().connected(cluster)
    pol = _policy(cluster)
    if not pol["scratch"]:
        raise RuntimeError(f"No scratch folder found on {s.cfg.name}")
    sc = remind.schedule(pol["scratch"], policy.Purge(**pol["purge"]), s.cfg.id, enabled=bool(enabled), days=days,
                         time=time, horizon=int(horizon_days))
    _run(s.ssh, schedules.save_command(sc, s.cfg.claude, s.cfg.profile))
    return reminders(cluster)


@method("backup.alerts")
def alerts() -> list[dict]:
    """From the newest summary of each cluster and today's date: what goes within a week. No cluster calls."""
    import time as clock
    out = []
    with _lock:
        known = dict(_summaries)
    for cluster, data in known.items():
        a = remind.alert(data, clock.time())
        if a:
            try:
                name = hub().session(cluster).cfg.name
            except (KeyError, ValueError, RuntimeError):
                name = cluster
            title, text = remind.message(name, a)
            out.append({"cluster": cluster, **a, "kind": "at_risk", "title": title, "text": text})
    return out
