"""The backup plan: what to copy from a scan and why, with your choices kept on the cluster for later scans."""

import json
import shlex
import threading

from ...backup import agent as backup_agent
from ...backup import plan, scan
from ...backup.model import Destination
from ..server import method
from .backup import _fetch, _fetch_json, _run, _ssh, _summary

CHOICES = f'"$HOME"/{scan.ROOT}/choices.json'

_plans: dict[tuple[str, str], plan.Plan] = {}
_lock = threading.Lock()


def _choices(cluster: str) -> list:
    text = _ssh(cluster).run(f"cat {CHOICES} 2>/dev/null", timeout=60).stdout
    try:
        data = json.loads(text) if text.strip() else []
    except ValueError:
        data = []
    return data if isinstance(data, list) else []


def _save_choices(cluster: str, choices: list) -> None:
    body = shlex.quote(json.dumps(choices))
    _run(_ssh(cluster), f'mkdir -p "$HOME"/{scan.ROOT} && printf %s {body} > {CHOICES}')


def _merge_choices(saved: list, changes: list) -> list:
    """changes win over saved ones for the same folder and class; malformed ones are dropped."""
    merged = {(c.get("path"), c.get("class") or ""): c for c in saved}
    for c in changes:
        if isinstance(c, dict) and c.get("path") and isinstance(c.get("keep"), bool):
            cls = c.get("class") or ""
            merged[(c["path"], cls)] = {"path": c["path"], "class": cls, "keep": c["keep"]}
    return list(merged.values())


def _target(dests: list[Destination], dest: str, scratch: str) -> Destination:
    if dest:
        plan.check_dest(dest, dests, scratch)
        return next(d for d in dests if plan.dest_path(d.path) == dest)
    return ([d for d in dests if d.label != "Home"] or dests)[0]


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
    target = _target(dests, dest, data.get("scratch", ""))
    home = next((d for d in dests if d.label == "Home"), None)
    choices = _choices(cluster)
    if changes:
        choices = _merge_choices(choices, changes)
        _save_choices(cluster, choices)
    agent = backup_agent.validate(_fetch(cluster, id, "plan.agent.json") or "{}",
                                  [f["path"] for f in data.get("folders", [])])
    p = plan.build(data, target, horizon=horizon_days, scope=scope, whole_folders=whole_folders, agent=agent,
                   choices=choices, home=home, code_to_home=code_to_home)
    dry = _fetch_json(cluster, id, "dry.json")
    if dry.get("hash") == p.hash:
        p.exact, p.files, p.bytes = True, dry.get("files", p.files), dry.get("bytes", p.bytes)
        p.space = plan.space(target, p.bytes, p.files)
    with _lock:
        _plans[(cluster, id)] = p
    out = plan.to_dict(p)
    out["will_replace"] = dry.get("will_replace", 0) if p.exact else 0
    out["busy"] = dry.get("busy", []) if p.exact else []
    return out


def made_plan(cluster: str, scan_id: str) -> plan.Plan:
    with _lock:
        p = _plans.get((cluster, scan.check_id(scan_id)))
    if p is None:
        raise RuntimeError("Make the plan first")
    return p
