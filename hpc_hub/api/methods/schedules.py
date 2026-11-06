import re
from dataclasses import asdict

from ...agents import schedules
from ...agents.catalog import AGENTS, BY_ID
from ...agents.schedules import PRESETS, Schedule, Status
from ...connect.session import ClusterSession
from ..hub import hub
from ..server import method

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_MINUTES = 99 * 1440
LOG_TAIL = 200_000  # bytes of the newest answer


def _json(st: Status) -> dict:
    sc = st.schedule
    agent = BY_ID.get(sc.agent, AGENTS[0])
    return {**asdict(sc), "compute": sc.compute if isinstance(sc.compute, dict) else {}, "agent_name": agent.name,
            "when": sc.when, "job_id": st.job_id, "state": st.state, "start": st.start, "last_run": st.last_run,
            "last_log": st.last_log}


def _profile_json(p) -> dict:
    return {k: v for k, v in asdict(p).items() if k != "extra_args"}


def _run(s: ClusterSession, command: str, failed: str) -> str:
    res = s.ssh.run(command, timeout=60)
    if res.returncode != 0:
        raise ValueError(res.stderr.strip() or failed)
    return res.stdout.strip()


def _find(s: ClusterSession, name: str) -> Status:
    st = next((x for x in schedules.list_schedules(s.ssh) if x.schedule.name == name), None)
    if not st:
        raise ValueError(f"No schedule {name} on {s.cfg.name}")
    return st


def _queue(s: ClusterSession, sc: Schedule) -> None:
    _run(s, schedules.save_command(sc, getattr(s.cfg, sc.agent), s.cfg.profile), f"Could not save {sc.name}")


def clean(raw: dict) -> Schedule:
    """A schedule from the UI, checked, or ValueError saying what to fix."""
    name = schedules.slug(str(raw.get("name", "")))
    task = str(raw.get("task", "")).strip()
    at = str(raw.get("time", "")).strip()
    agent = str(raw.get("agent", "claude"))
    if agent not in BY_ID:
        raise ValueError(f"No agent {agent}")
    if not task:
        raise ValueError("Write a task")
    if not TIME_RE.match(at):
        raise ValueError("Time must look like 02:00")
    days = raw.get("days") or []
    if not isinstance(days, list) or any(isinstance(d, bool) or d not in range(1, 8) for d in days):
        raise ValueError("Days are 1 (Monday) to 7 (Sunday)")
    days = sorted(set(days))
    minutes = raw.get("minutes", 120)
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= MAX_MINUTES:
        raise ValueError("Time each run may take must be at least a minute")
    compute = raw.get("compute") or {}
    if not isinstance(compute, dict):
        raise ValueError("Compute must be cores, memory, GPUs and a queue")
    keys = schedules.COMPUTE_INTS + schedules.COMPUTE_TEXT
    sc = Schedule(name, agent, str(raw.get("folder", "")).strip() or "~", task, at, [] if len(days) == 7 else days,
                  minutes, bool(raw.get("enabled", True)), {k: v for k, v in compute.items() if k in keys})
    return sc


@method("schedules.options")
def options(cluster: str) -> dict:
    """What the edit dialog offers: agents, ready-made tasks, the default folder and the cluster's node settings."""
    cfg = hub().session(cluster).cfg
    return {"agents": [{"id": a.id, "name": a.name} for a in AGENTS],
            "presets": [{"label": label, "role": role, "task": text} for label, (role, text) in PRESETS.items()],
            "days": schedules.DAY_NAMES, "folder": cfg.claude.workdir or "~", "profile": _profile_json(cfg.profile),
            "root": f"~/{schedules.ROOT}"}


@method("schedules.list")
def list_schedules(cluster: str) -> list[dict]:
    """Every schedule on the cluster with its queued job and newest answer."""
    return [_json(st) for st in schedules.list_schedules(hub().connected(cluster).ssh)]


@method("schedules.save")
def save(cluster: str, schedule: dict, old_name: str = "") -> list[dict]:
    """Write the schedule and queue its next run. old_name: the one being edited (renaming removes it)."""
    s = hub().connected(cluster)
    sc = clean(schedule)
    schedules.profile_for(sc, s.cfg.profile)  # bad cores or queue names stop here
    old = schedules.slug(old_name) if old_name else ""
    taken = {st.schedule.name for st in schedules.list_schedules(s.ssh)}
    if sc.name in taken and sc.name != old:
        raise ValueError(f"A schedule named {sc.name} exists")
    if old and old != sc.name and old in taken:
        s.ssh.run(schedules.delete_command(Schedule(old)), timeout=60)
    _queue(s, sc)
    return list_schedules(cluster)


@method("schedules.toggle")
def toggle(cluster: str, name: str, enabled: bool) -> list[dict]:
    """On: queue the next run. Off: cancel the waiting job; it stays saved."""
    s = hub().connected(cluster)
    sc = _find(s, name).schedule
    sc.enabled = bool(enabled)
    _queue(s, sc)
    return list_schedules(cluster)


@method("schedules.run_now")
def run_now(cluster: str, name: str) -> dict:
    """One extra run right now, which does not queue another."""
    s = hub().connected(cluster)
    _find(s, name)
    return {"job": _run(s, schedules.run_now_command(name), f"Could not start {name}")}


@method("schedules.delete")
def delete(cluster: str, name: str) -> None:
    """Stop it and remove its task and logs from the cluster."""
    s = hub().connected(cluster)
    s.ssh.run(schedules.delete_command(_find(s, name).schedule), timeout=60)


@method("schedules.log")
def log(cluster: str, name: str) -> dict:
    """The newest answer of a schedule (its end, when long). Empty path: it has not run yet."""
    s = hub().connected(cluster)
    logs = f"{schedules.folder_of(schedules.slug(name))}/logs"
    res = s.ssh.run(f'f=$(ls -t {logs}/*.md 2>/dev/null | head -1); [ -n "$f" ] || exit 0; '
                    f'echo "$f"; tail -c {LOG_TAIL} "$f"', timeout=60)
    if res.returncode != 0:
        raise ValueError(res.stderr.strip() or "Could not read the log")
    path, _, text = res.stdout.partition("\n")
    return {"path": path, "text": text, "folder": f"~/{schedules.ROOT}/{schedules.slug(name)}/logs"}
