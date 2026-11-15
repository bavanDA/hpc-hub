"""Groups to bill that are for a course: HPC Hub never picks one on its own (you may), and says when one has ended.

A course group's name starts with its term on Wulver ("2026-spring-cs-100-..."); the term's end is when its jobs stop
being taken. Hidden groups (Hide this group) are kept in app.toml as "cluster/group" entries."""

import re
from datetime import date

TERM = re.compile(r"^(\d{4})[-_](spring|summer|fall|winter)(?![a-z])", re.I)
TERM_END = {"winter": (1, 31), "spring": (5, 31), "summer": (8, 31), "fall": (12, 31)}
COURSE_QOS = "course"


def is_course(account: str, qos: list[str] | None = None) -> bool:
    return bool(TERM.match(account)) or (qos is not None and COURSE_QOS in qos)


def ended(account: str, today: date | None = None) -> str:
    """"spring 2026" when the group's term is over, else ""."""
    m = TERM.match(account)
    if not m:
        return ""
    year, term = int(m.group(1)), m.group(2).lower()
    month, day = TERM_END[term]
    return f"{term} {year}" if (today or date.today()) > date(year, month, day) else ""


def refused_text(account: str, today: date | None = None) -> str:
    """What to add when Slurm refuses a job billed to a course group."""
    term = ended(account, today)
    why = f"its term ({term}) is over" if term else "it may have ended"
    return (f"Your course group {account} can't run jobs: {why}. Pick another group, or hide this one under "
            "Group to bill in Get one.")


def hidden(setting: str, cluster: str) -> list[str]:
    """The groups hidden on this cluster, from app.toml's "cluster/group,cluster/group"."""
    out = []
    for item in setting.split(","):
        c, _, account = item.strip().partition("/")
        if c == cluster and account and account not in out:
            out.append(account)
    return out


def set_hidden(setting: str, cluster: str, account: str, hide: bool) -> str:
    items = [i.strip() for i in setting.split(",") if i.strip() and i.strip() != f"{cluster}/{account}"]
    if hide:
        items.append(f"{cluster}/{account}")
    return ",".join(items)
