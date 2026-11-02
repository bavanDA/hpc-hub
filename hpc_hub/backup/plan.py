"""The plan: what to copy from the scan, why, and what it does to the project folder's space.

Choices come in layers, each beating the one before: the rules (classify.py), the agent (agent.validate), then
yours. Before the trial run the numbers are estimates from the scan's totals; the trial run makes them exact.
The copy job's filter (listfilter.py) applies the same rules file by file."""

import hashlib
import json
from dataclasses import asdict

from .model import KEEP_BY_DEFAULT, Destination, Item, Plan, Space

GB = 1024 ** 3
SMALL_UNSURE = 1 * GB  # unknown kinds below this per folder are kept
BIG_LOGS = 50 * 1024 ** 2
WARN_PCT = 90
FROM_SCRATCH = "from-scratch"
DEST_ONLY = "Copies only go to a from-scratch folder in your project or home space."

# what a row says under its kind; nothing when the kind says it all
WHY = {
    "regen": "Packages, caches and builds",
    "checkpoint": "Old checkpoints. The newest one is kept.",
}


def dest_path(base: str) -> str:
    """Where copies go: <project or home folder>/from-scratch."""
    base = base.rstrip("/")
    if not base.startswith("/") or ".." in base.split("/"):
        raise ValueError(DEST_ONLY)
    return f"{base}/{FROM_SCRATCH}"


def check_dest(dest: str, allowed: list[Destination], scratch: str) -> str:
    """dest must be one of the cluster's project or home folders plus /from-scratch, and not inside scratch."""
    bases = {dest_path(d.path) for d in allowed}
    s = scratch.rstrip("/")
    if dest not in bases or dest == s or dest.startswith(s + "/"):
        raise ValueError(DEST_ONLY)
    return dest


def _numbers(c: dict, scope: str) -> tuple[int, int]:
    return (c.get("files", 0), c.get("bytes", 0)) if scope == "everything" else \
        (c.get("at_risk_files", 0), c.get("at_risk_bytes", 0))


def _default(folder: dict, cls: str, files: int, size: int, whole: bool) -> tuple[bool, str, int]:
    """keep, why, how many of the newest to keep anyway"""
    if whole and folder.get("git") and cls not in ("regen",):
        return True, "Git repo, copied whole", 0
    if cls == "checkpoint":
        return False, WHY["checkpoint"], 1
    if cls == "logs" and size > BIG_LOGS:
        return False, "Big logs. Turn on to keep.", 0
    if cls == "unsure":
        if size <= SMALL_UNSURE:
            return True, "Kind not known. Small, so it is kept.", 0
        return False, "Big files of unknown kind. Turn on to keep.", 0
    return cls in KEEP_BY_DEFAULT, WHY.get(cls, ""), 0


def build(summary: dict, dest: Destination, *, horizon: int | None = None, scope: str = "at_risk",
          whole_folders: bool = True, agent: dict | None = None, choices: list | None = None,
          home: Destination | None = None, code_to_home: bool = False) -> Plan:
    """The plan for one scan. choices: [{path, class?, keep}] from you; class empty means the whole folder."""
    if scope not in ("at_risk", "everything"):
        raise ValueError("Pick at_risk or everything")
    horizon = summary.get("horizon_days", 14) if horizon is None else min(int(horizon), summary.get("horizon_days", 14))
    agent = agent or {"folders": [], "patterns": [], "summary": ""}
    mine = {(c.get("path"), c.get("class") or ""): bool(c.get("keep")) for c in (choices or []) if c.get("path")}
    by_agent = {(f["path"], f.get("class") or ""): f for f in agent.get("folders", [])}
    kept, left, rules = [], [], []
    for folder in summary.get("folders", []):
        path = folder["path"]
        for cls, c in sorted(folder.get("by_class", {}).items()):
            files, size = _numbers(c, scope)
            if not files:
                continue
            keep, why, newest = _default(folder, cls, files, size, whole_folders)
            by = "rule"
            for key in ((path, ""), (path, cls)):  # the folder as a whole, then this kind in it
                if key in by_agent:
                    keep, why, by = by_agent[key]["keep"], by_agent[key]["why"] or why, "agent"
            for key in ((path, ""), (path, cls)):
                if key in mine:
                    keep, by = mine[key], "you"
            to = "home" if code_to_home and home and cls == "code" and keep else "project"
            item = Item(path, cls, keep, files, size, why, by)
            (kept if keep else left).append(item)
            rules.append({"folder": path, "class": cls, "keep": keep, "except_newest": 0 if keep else newest,
                          "to": to})
    yours = {p for p, _ in mine}
    for p in agent.get("patterns", []):
        if p["folder"] not in yours:  # your choice for a folder beats the agent's patterns in it
            rules.append({"folder": p["folder"], "glob": p["glob"], "keep": p["keep"],
                          "except_newest": p["except_newest"], "to": "project"})
    files = sum(i.files for i in kept)
    size = sum(i.bytes for i in kept)
    plan = Plan(scan_id=summary.get("id", ""), dest=dest_path(dest.path), horizon_days=horizon, scope=scope,
                items=kept, left_out=left, files=files, bytes=size, agent_summary=agent.get("summary", ""),
                rules=rules)
    plan.space = space(dest, size, files)
    plan.hash = plan_hash(plan)
    return plan


def space(dest: Destination, size: int, files: int) -> Space:
    gb = size / GB
    after = dest.used_gb + gb
    pct = int(round(100 * after / dest.quota_gb)) if dest.quota_gb else 0
    files_after = dest.files + files if dest.files else 0
    fits = not dest.quota_gb or after <= dest.quota_gb
    fits = fits and not (dest.file_limit and files_after > dest.file_limit)
    warn = ""
    if dest.quota_gb and not fits and after > dest.quota_gb:
        warn = (f"This does not fit. Project has {max(dest.quota_gb - dest.used_gb, 0):.0f} GB free and the copy "
                f"needs {gb:.0f} GB.")
    elif dest.file_limit and files_after > dest.file_limit:
        warn = (f"This adds {files:,} files. Project allows {dest.file_limit:,} and has {dest.files:,}.")
    elif pct >= WARN_PCT:
        warn = f"This fills project to {pct}%. Jobs that write to project can fail when it is full."
    return Space(dest=dest_path(dest.path), before_gb=round(dest.used_gb, 1), after_gb=round(after, 1),
                 quota_gb=round(dest.quota_gb, 1), pct_after=pct, files_after=files_after,
                 file_limit=dest.file_limit, fits=fits, warn=warn)


def plan_hash(plan: Plan) -> str:
    """What the trial run checked; a copy is refused when the plan changed after it."""
    key = {"scan": plan.scan_id, "dest": plan.dest, "horizon": plan.horizon_days, "scope": plan.scope,
           "rules": plan.rules}
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


def rules_json(plan: Plan) -> str:
    """What the copy job's filter reads."""
    return json.dumps({"hash": plan.hash, "horizon": plan.horizon_days, "scope": plan.scope, "rules": plan.rules})


def to_dict(plan: Plan) -> dict:
    return asdict(plan)
