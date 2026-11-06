"""The weekly scratch check, a scheduled job on the cluster, and the alerts worked out between checks."""

import time as clock  # set_reminders has a time parameter

from ...agents import schedules
from ...backup import remind
from ..hub import hub
from ..server import method
from .backup import _run, _scratch_policy, latest_summaries

HORIZON_DAYS = 14


def _reminder(cluster: str) -> schedules.Status | None:
    found = schedules.list_schedules(hub().connected(cluster).ssh)
    return next((st for st in found if st.schedule.name == remind.NAME), None)


@method("backup.reminders")
def reminders(cluster: str) -> dict:
    st = _reminder(cluster)
    if st is None:
        return {"enabled": False, "days": remind.DEFAULT_DAYS, "time": remind.DEFAULT_TIME,
                "horizon_days": HORIZON_DAYS}
    return {"enabled": st.schedule.enabled, "days": st.schedule.days, "time": st.schedule.time,
            "horizon_days": remind.options(st.schedule).get("horizon", HORIZON_DAYS), "next": st.start}


@method("backup.set_reminders")
def set_reminders(cluster: str, enabled: bool, days: list[int] | None = None, time: str = remind.DEFAULT_TIME,
                  horizon_days: int = HORIZON_DAYS) -> dict:
    """Check scratch on these days (1 = Monday) at this time."""
    s = hub().connected(cluster)
    pol, purge = _scratch_policy(cluster)
    sc = remind.schedule(pol["scratch"], purge, s.cfg.id, enabled=bool(enabled), days=days, time=time,
                         horizon=int(horizon_days))
    _run(s.ssh, schedules.save_command(sc, s.cfg.claude, s.cfg.profile))
    return reminders(cluster)


def _name(cluster: str) -> str:
    try:
        return hub().session(cluster).cfg.name
    except (KeyError, ValueError, RuntimeError):
        return cluster


@method("backup.alerts")
def alerts() -> list[dict]:
    """What goes within a week, from the newest summary of each cluster and today's date. No cluster calls."""
    now = clock.time()
    out = []
    for cluster, data in latest_summaries().items():
        a = remind.alert(data, now)
        if a:
            title, text = remind.message(_name(cluster), a)
            out.append({"cluster": cluster, **a, "kind": "at_risk", "title": title, "text": text})
    return out
