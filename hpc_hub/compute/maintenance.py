"""The cluster-wide maintenance Slurm has booked, so a job that would run into it can say so before it is sent."""

from dataclasses import dataclass
from datetime import datetime

COMMAND = "date +%FT%T; date +%Z; scontrol show reservation -o 2>/dev/null; true"


@dataclass
class Maintenance:
    start: str  # the cluster's own clock: 2026-11-10T07:50:00
    tz: str  # that clock's zone: EST
    minutes_left: int  # until it starts; 0 once it has
    active: bool


def _time(text: str) -> datetime | None:
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def parse(text: str) -> Maintenance | None:
    """The next maintenance of the whole cluster. Reservations that keep a few broken nodes out don't count: jobs
    still run on the others."""
    lines = text.splitlines()
    now = _time(lines[0].strip()) if lines else None
    if not now or len(lines) < 2:
        return None
    found = []
    for line in lines[2:]:
        words = dict(w.partition("=")[::2] for w in line.split())
        flags = words.get("Flags", "").split(",")
        start, end = _time(words.get("StartTime", "")), _time(words.get("EndTime", ""))
        if "MAINT" in flags and ("ALL_NODES" in flags or words.get("Nodes") == "ALL") and start and end and end > now:
            found.append(start)
    if not found:
        return None
    start = min(found)
    left = max(int((start - now).total_seconds()) // 60, 0)
    return Maintenance(start.isoformat(), lines[1].strip(), left, start <= now)


def next_maintenance(ssh) -> Maintenance | None:
    return parse(ssh.read(COMMAND, timeout=20).stdout)
