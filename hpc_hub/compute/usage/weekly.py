import re
import time
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from ...core.ssh import SshMaster
from .accounts import AccountUsage, account_usage
from .sections import qos_factors, run_script, sections

WEEKS = 12
CACHE_SECONDS = 600

# SUs (billing times the time run) per group, start day and QoS (D), and per group, person and QoS (U).
# The QoS usage factor is applied in Python. PAID: partition prefixes that bill, "" = all.
WEEKLY = r"""A=$1 PAID=$2
echo @QOS; sacctmgr -n -P show qos format=name,usagefactor 2>/dev/null
echo @JOBS
sacct -a -A "$A" -X -n -P -S "$(date -d '-83 days' +%F)" -E now \
  -o Account,User,Start,QOS,ElapsedRaw,AllocTRES,Partition 2>/dev/null |
  awk -F'|' -v paid="$PAID" 'BEGIN {n=split(paid, pre, " ")}
             {if (n) {ok=0; for (i=1; i<=n; i++) if (index($7, pre[i]) == 1) ok=1; if (!ok) next}
              b=0; if (match($6, /billing=[0-9]+/)) b=substr($6, RSTART+8, RLENGTH-8); s=b*$5/3600; if (s <= 0) next
              d[tolower($1)"|"substr($3, 1, 10)"|"$4]+=s; u[tolower($1)"|"$2"|"$4]+=s}
             END {for (k in d) printf "D|%s|%.2f\n", k, d[k]; for (k in u) printf "U|%s|%.2f\n", k, u[k]}'
echo "@RC ${PIPESTATUS[0]}"
echo @TODAY; date +%F"""


@dataclass
class Weekly:
    weeks: list[float]  # SUs billed in each of the last 12 weeks, oldest first; the last one ends today
    people: dict[str, float] = field(default_factory=dict)  # user -> SUs over those 12 weeks


@dataclass
class Allocation(AccountUsage):
    weeks: list[float] | None = None  # None = the cluster could not tell
    people: dict[str, float] = field(default_factory=dict)
    per_day: float | None = None  # SUs a day over the last 4 weeks
    days_left: float | None = None  # at that pace; None = no limit, nothing used lately, or not known
    runs_out: str = ""  # ISO day it runs out at that pace
    end: str = ""  # ISO day the allocation period ends, "" = not said
    near: bool = False  # runs out before the end (or within 30 days when the end is not known), or used up


def parse_weekly(text: str) -> dict[str, Weekly] | None:
    """Per group (lowercase). None when sacct could not answer."""
    sec = sections(text)
    rc = re.search(r"^@RC (\d+)", text, re.M)
    try:
        today = date.fromisoformat((sec.get("TODAY") or [""])[0].strip())
    except ValueError:
        return None
    if not rc or rc.group(1) != "0":
        return None
    factor = qos_factors(sec.get("QOS", []))
    out: dict[str, Weekly] = {}
    for line in sec.get("JOBS", []):
        p = line.split("|")
        if len(p) != 5 or p[0] not in ("D", "U") or not p[1]:
            continue
        try:
            sus = float(p[4]) * factor.get(p[3], 1.0)
        except ValueError:
            continue
        w = out.setdefault(p[1], Weekly([0.0] * WEEKS))
        if p[0] == "U":
            if p[2]:
                w.people[p[2]] = round(w.people.get(p[2], 0) + sus, 1)
            continue
        try:
            age = max((today - date.fromisoformat(p[2])).days, 0)
        except ValueError:  # Unknown: never started
            continue
        week = WEEKS - 1 - min(age // 7, WEEKS - 1)  # jobs that began before the 12 weeks count in the first
        w.weeks[week] += sus
    for w in out.values():
        w.weeks = [round(x, 1) for x in w.weeks]
        w.people = {u: s for u, s in w.people.items() if s > 0}  # free QoS only: nothing billed
    return out


_weekly_cache: dict[tuple[str, str], tuple[float, dict[str, Weekly] | None]] = {}


def weekly(ssh: SshMaster, cluster: str, accounts: list[str], fresh: bool = False,
           paid: str = "") -> dict[str, Weekly] | None:
    key = (cluster, ",".join(sorted(accounts)))
    hit = _weekly_cache.get(key)
    if hit and not fresh and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    got = parse_weekly(run_script(ssh, WEEKLY, key[1], paid)) if accounts else {}
    _weekly_cache[key] = (time.monotonic(), got)
    return got


def pace(a: AccountUsage, w: Weekly | None, today: date, end: str = "") -> Allocation:
    out = Allocation(**asdict(a), end=end)
    if w is None:
        out.near = bool(a.quota) and a.used >= a.quota
        return out
    out.weeks, out.people = w.weeks, w.people
    out.per_day = round(sum(w.weeks[-4:]) / 28, 1)
    if a.quota:
        left = max(a.quota - a.used, 0)
        if out.per_day > 0:
            out.days_left = round(left / out.per_day, 1)
            out.runs_out = (today + timedelta(days=int(out.days_left))).isoformat()
        out.near = left <= 0 or (out.runs_out < end if end and out.runs_out else
                                 out.days_left is not None and out.days_left <= 30)
    return out


def allocations(ssh: SshMaster, cluster: str, fresh: bool = False, paid: str = "") -> list[Allocation]:
    groups = account_usage(ssh)
    weeks = weekly(ssh, cluster, [a.account for a in groups], fresh, paid) if groups else {}
    today = date.today()
    return [pace(a, None if weeks is None else weeks.get(a.account.lower(), Weekly([0.0] * WEEKS)), today)
            for a in groups]
