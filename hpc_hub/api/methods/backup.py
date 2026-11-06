"""The backup agent's scan: scratch's purge rule and space, then a Slurm job that finds what the timer is about to
delete. Its files live in ~/.hpc-hub/backup/<id>/ on the cluster, so it goes on with the app closed."""

import json
import threading
from dataclasses import asdict

from ...agents import catalog
from ...backup import agent as backup_agent
from ...backup import policy, scan
from ...backup.model import Destination
from ...compute.usage import storage as quotas
from ...files import remote_fs
from ..hub import hub
from ..server import method

_summaries: dict[str, dict] = {}  # cluster -> the newest summary fetched, for alerts without a new scan
_lock = threading.Lock()


def _run(ssh, command: str, timeout: int = 120) -> str:
    res = ssh.run(command, timeout=timeout)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or "The cluster said no").strip().splitlines()[-1])
    return res.stdout


def _job_id(out: str) -> str:
    """sbatch --parsable prints "id" or "id;cluster" as its last line."""
    return out.strip().splitlines()[-1].split(";")[0] if out.strip() else ""


def _fetch(cluster: str, scan_id: str, name: str) -> str:
    return hub().connected(cluster).ssh.run(scan.fetch_command(scan.check_id(scan_id), name), timeout=120).stdout


def _fetch_json(cluster: str, scan_id: str, name: str) -> dict:
    text = _fetch(cluster, scan_id, name)
    try:
        data = json.loads(text) if text.strip() else {}
    except ValueError:
        data = {}
    return data if isinstance(data, dict) else {}


def _row_for(rows: list[quotas.Storage], kind: str) -> quotas.Storage | None:
    for r in rows:
        if kind == "home" and r.label == "Home" or kind != "home" and kind in r.label.lower():
            return r
    return None


def _destination(p: remote_fs.Place, r: quotas.Storage | None) -> Destination:
    used, quota = (float(r.used), float(r.quota)) if r else (0.0, 0.0)
    return Destination(path=p.path, label=p.label, used_gb=used, quota_gb=quota,
                       free_gb=max(quota - used, 0.0) if quota else 0.0,
                       files=r.files if r else 0, file_limit=r.file_limit if r else 0,
                       shared_with=len(r.people) if r else 0, backed_up=bool(r and r.backup == "Yes"))


def _policy(cluster: str) -> dict:
    """Scratch, the purge rule and where copies can go, with their space."""
    s = hub().connected(cluster)
    rows, _ = quotas.storage(s.ssh, s.cfg.profile.account)
    found = remote_fs.storage(remote_fs.places(s.ssh))
    scratch_row = _row_for(rows, "scratch")
    purge = policy.resolve(s.cfg.id)
    if scratch_row and scratch_row.purged:
        purge.days, purge.from_cluster = scratch_row.purged, True
    scratch = next((p.path for p in found if p.label.startswith("Scratch")), "")
    dests = []
    for p in found:
        kind = "project" if p.label.startswith("Project") else "home" if p.label == "Home" else ""
        if kind:
            dests.append(_destination(p, _row_for(rows, kind)))
    fill = int(100 * scratch_row.used / scratch_row.quota) if scratch_row and scratch_row.quota else 0
    return {"scratch": scratch, "destinations": [asdict(d) for d in dests], "purge": asdict(purge),
            "scratch_fill_pct": fill, "files_in_scratch": scratch_row.files if scratch_row else 0,
            "no_tricks": policy.NO_TRICKS}


def _scratch_policy(cluster: str) -> tuple[dict, policy.Purge]:
    pol = _policy(cluster)
    if not pol["scratch"]:
        raise RuntimeError(f"No scratch folder found on {hub().connected(cluster).cfg.name}")
    return pol, policy.Purge(**pol["purge"])


@method("backup.policy")
def get_policy(cluster: str) -> dict:
    return _policy(cluster)


@method("backup.scan")
def start_scan(cluster: str, horizon_days: int = 14, group: bool = False, agent: str = "") -> dict:
    """Start a scan job; answers its id and job id. agent: also let that agent sort the folders."""
    s = hub().connected(cluster)
    pol, purge = _scratch_policy(cluster)
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


@method("backup.scans")
def scans(cluster: str, limit: int = 10) -> list[dict]:
    return scan.parse_list(_run(hub().connected(cluster).ssh, scan.list_command(int(limit))))


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


def latest_summaries() -> dict[str, dict]:
    with _lock:
        return dict(_summaries)


def _cached_summary(cluster: str, scan_id: str) -> dict:
    with _lock:
        data = _summaries.get(cluster)
    return data if data and data.get("id") == scan_id else _summary(cluster, scan_id)


@method("backup.summary")
def summary(cluster: str, id: str) -> dict:
    return _summary(cluster, id)
