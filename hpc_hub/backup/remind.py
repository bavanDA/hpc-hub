"""The weekly scratch check and the alerts between checks.

The check is a scheduled agent (agents/schedules.py) with runner "backup": the same sbatch --begin chain, so it
shows on the Scheduled agents page, but each run is a scan (scan.body) instead of an agent's task. Files age at a
known pace, so the app works out the alerts from the latest summary and today's date; no new scan is needed."""

import json
import shlex

from ..agents import schedules
from ..compute import slurm
from ..core.config import ComputeProfile
from . import scan
from .model import Purge

NAME = "backup-check"
DEFAULT_DAYS = [1]  # Mondays
DEFAULT_TIME = "03:00"
WARN_DAYS = 7


def schedule(scratch: str, purge: Purge, cluster_id: str, *, enabled: bool = True, days: list[int] | None = None,
             time: str = DEFAULT_TIME, horizon: int = 14, group: bool = False) -> schedules.Schedule:
    task = json.dumps({"scratch": scratch, "days": purge.days, "basis": purge.basis, "horizon": int(horizon),
                       "group": bool(group), "cluster": cluster_id})
    return schedules.Schedule(name=NAME, folder="~", task=task, time=time, days=list(days or DEFAULT_DAYS),
                              minutes=scan.SCAN_MINUTES, enabled=enabled, runner="backup")


def options(s: schedules.Schedule) -> dict:
    try:
        o = json.loads(s.task)
    except ValueError:
        o = {}
    return o if isinstance(o, dict) else {}


def scheduled_script(s: schedules.Schedule, profile: ComputeProfile) -> str:
    """Queue the next check, then scan into a new ~/.hpc-hub/backup/<id>/ like a scan started by hand."""
    o = options(s)
    purge = Purge(days=int(o.get("days", 0)), basis=str(o.get("basis", "oldest")))
    profile = scan.job_profile(profile, str(o.get("cluster", "")))
    days = " ".join(str(d) for d in (s.days or range(1, 8)))
    meta = {"scratch": o.get("scratch", ""), "horizon": int(o.get("horizon", 14)), "group": bool(o.get("group")),
            "agent": "", "scheduled": True}
    lines = [
        "#!/bin/bash -l",
        f"#SBATCH --job-name={s.job_name}",
        "#SBATCH --output=logs/slurm-%j.out",
        *[f"#SBATCH {a}" for a in slurm.resource_args(profile)],
        "",
        f"SDIR={schedules.folder_of(s.name)}",
        f"DAYS={shlex.quote(days)}",
        f"TIME={shlex.quote(s.time)}",
        schedules.NEXT_RUN,
        'if [ -z "${HPCHUB_ONCE:-}" ] && [ -f "$SDIR/enabled" ]; then',
        '  sbatch --quiet --begin="$(next_run)" "$SDIR/run.sbatch"',
        "fi",
        'ID="$(date +%Y%m%d-%H%M%S)-$(od -An -N2 -tx1 /dev/urandom | tr -d " \\n")"',
        f'DIR="$HOME"/{scan.ROOT}/"$ID"',
        'mkdir -p "$DIR" || exit 1',
        f"printf %s {shlex.quote(scan._b64(json.dumps(meta)))} | base64 -d | "
        'python3 -I -c \'import json,sys; m=json.load(sys.stdin); m["id"]=sys.argv[1]; print(json.dumps(m))\' "$ID" '
        '> "$DIR/meta.json"',
        f'printf %s {shlex.quote(scan._b64(scan.remote_source("classify", "summarize")))} | base64 -d '
        '> "$DIR/summarize.py"',
        'cp "$SDIR/run.sbatch" "$DIR/scan.sbatch"',
        *scan.body(str(o.get("scratch", "")), purge, int(o.get("horizon", 14)), group=bool(o.get("group"))),
    ]
    return "\n".join(lines)


def alert(summary: dict, now: float, warn_days: int = WARN_DAYS, copied: int = 0) -> dict | None:
    """What the timer deletes within warn_days from now, from a scan done earlier; None when nothing.
    copied: files the last finished backup already covered."""
    if not summary or not summary.get("purge", {}).get("days"):
        return None
    passed = int((now - summary.get("started", now)) // 86400)
    files = size = 0
    soonest = None
    for d in summary.get("deadlines", []):
        left = d["days"] - passed
        if left <= warn_days:
            files += d["files"]
            size += d["bytes"]
            soonest = left if soonest is None else min(soonest, left)
    files = max(files - copied, 0)
    if not files:
        return None
    top = next((f["path"] for f in summary.get("folders", []) if f.get("at_risk_files")), "")
    return {"files": files, "bytes": size, "soonest_days": max(soonest or 0, 0), "top_folder": top}


def message(cluster_name: str, a: dict) -> tuple[str, str]:
    """The notification: title and text."""
    gb = a["bytes"] / 1024 ** 3
    when = "any day now" if a["soonest_days"] <= 0 else \
        "tomorrow" if a["soonest_days"] == 1 else f"in {a['soonest_days']} days"
    return (f"Scratch on {cluster_name}",
            f"{a['files']:,} files in scratch will be deleted {when}. {gb:.0f} GB.")
