"""Group SU usage per person, storage quotas and cluster load, for the Usage page."""

import json
import re
import shlex
import time
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from ..core.ssh import SshMaster

GROUP = r"""A=$1; D=$2
echo @QOS; sacctmgr -n -P show qos format=name,usagefactor 2>/dev/null
echo @JOBS
sacct -a -A "$A" -X -n -P -S "$(date -d "-$D days" +%F)" -E now -o User,QOS,ElapsedRaw,AllocTRES 2>/dev/null |
  awk -F'|' '{b=0; if (match($4, /billing=[0-9]+/)) b=substr($4, RSTART+8, RLENGTH-8);
              h[$1"|"$2]+=b*$3/3600} END {for (k in h) printf "%s|%.1f\n", k, h[k]}'
echo @NAMES
for u in $(sacctmgr -n -P show assoc where account="$A" format=user 2>/dev/null | sort -u); do
  printf '%s|%s\n' "$u" "$(getent passwd "$u" | cut -d: -f5 | cut -d, -f1)"
done"""

STORAGE = r"""A=$1
echo @QUOTA
if [ -x /apps/site/bin/quota_info.sh ]; then /apps/site/bin/quota_info.sh
elif command -v getquota >/dev/null; then getquota
elif command -v lfs >/dev/null && findmnt -n -t lustre >/dev/null; then  # Lustre (Expanse): one row per filesystem
  echo "Usage for account: $A"
  num='{for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[*]?$/) {print int($i / 1048576) "|" int($(i + 2) / 1048576); exit}}'
  findmnt -n -t lustre -o TARGET | while read -r m; do
    printf '%s %s\n' "$(lfs getname "$m" | awk '{sub(/-[^-]*$/, "", $1); print $1}')" "$m"
  done | awk '{b = $2; sub(/.*\//, "", b); n[$1] = n[$1] (n[$1] ? " + " : "") b; if (!m[$1]) m[$1] = $2}
              END {for (f in n) print m[f] "|" toupper(n[f])}' |
  while IFS='|' read -r m label; do
    u=$(lfs quota -q -u "$USER" "$m" | awk "$num")
    g=$([ -n "$A" ] && lfs quota -q -g "$A" "$m" | awk "$num")
    g=${g:-$u}
    echo "   $label Storage: ${g%|*} GB (of ${g#*|} GB quota)"
    echo "     User $USER Usage: ${u%|*} GB"
  done
else df -h "$HOME"; fi 2>/dev/null
echo @USERS
f=/mmfs1/apps/utils/custom/.mmfs1_quotas
[ -r "$f" ] && awk -v a="_$A" '$3 == "USR" && index($2, a) {print $1"|"$2"|"$4}' "$f"
true"""

LOAD = r"""echo @PART; sinfo -h -o '%P|%a|%D|%C'
echo @GPU; sinfo -h -N -O 'partition:|,gres:|,gresused:|'
echo @PEND; squeue -h -t PENDING -o %P | sort | uniq -c
echo @RUN; squeue -h -t RUNNING -o %P | sort | uniq -c"""


@dataclass
class Person:
    user: str
    name: str = ""
    charged: float = 0.0  # SU billed (QoS usage factor applied)
    hours: float = 0.0  # all core hours, free QoS included


@dataclass
class Storage:
    label: str
    used: int  # GB
    quota: int = 0  # GB, 0 = no quota
    mine: int | None = None  # GB you use in it
    people: dict[str, float] = field(default_factory=dict)  # user -> GB
    files: int = 0  # files in it, 0 = not known
    file_limit: int = 0
    backup: str = ""  # Yes or No, as the quota tool says; "" = not said
    purged: int = 0  # days before files are deleted, 0 = never or not said (Yale's getquota)


@dataclass
class Partition:
    name: str
    up: bool
    nodes: int
    cpus_used: int
    cpus_total: int
    gpus_used: int = 0
    gpus_total: int = 0
    running: int = 0
    pending: int = 0


def _sections(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    cur = ""
    for line in text.splitlines():
        if re.fullmatch(r"@[A-Z]+", line.strip()):
            cur = line.strip()[1:]
            out[cur] = []
        elif cur:
            out[cur].append(line)
    return out


def _run(ssh: SshMaster, script: str, *args: str) -> str:
    line = f"bash -c {shlex.quote(script)} _ " + " ".join(shlex.quote(a) for a in args)
    return ssh.run(line, timeout=120).stdout


# -- SU per person ------------------------------------------------------------------

def parse_group(text: str) -> list[Person]:
    sec = _sections(text)
    factor = {}
    for line in sec.get("QOS", []):
        p = line.split("|")
        try:
            factor[p[0]] = float(p[1])
        except (IndexError, ValueError):
            pass
    people: dict[str, Person] = {}
    for line in sec.get("NAMES", []):
        p = line.split("|")
        if p[0]:
            people[p[0]] = Person(p[0], p[1] if len(p) > 1 else "")
    for line in sec.get("JOBS", []):
        p = line.split("|")
        if len(p) != 3 or not p[0]:
            continue
        hours = float(p[2])
        who = people.setdefault(p[0], Person(p[0]))
        who.hours += hours
        who.charged += hours * factor.get(p[1], 1.0)
    return sorted(people.values(), key=lambda x: (-x.charged, -x.hours, x.user))


def group_usage(ssh: SshMaster, account: str, days: int) -> list[Person]:
    return parse_group(_run(ssh, GROUP, account, str(int(days))))


# -- storage --------------------------------------------------------------------------

QUOTA_RE = re.compile(r"(\d+) GB(?: \(of (\d+) GB quota\))?")


def parse_getquota(lines: list[str]) -> list[Storage]:
    """Yale's getquota tables: your share per fileset, the group's usage and quota, your home."""
    group, mine, rows = "", {}, []
    for line in lines:
        s = line.strip()
        if m := re.match(r"Quota Summary for (\S+) group", s):
            group = m.group(1)
        elif m := re.fullmatch(r"(\w+)\s+(GRP|USR)\s+(\d+)\s+(\d+)\b(.*)", s):
            name, kind, used, quota = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
            row = Storage("Home" if kind == "USR" and name == "home" else name if kind == "USR"
                          else f"{group} {name}".strip(), used, quota, used if kind == "USR" else mine.get(name))
            if more := re.fullmatch(r"\s+([\d,]+)\s+([\d,]+)\s+(Yes|No)\s+(?:(\d+)\s+days?|No)\s*", m.group(5)):
                row.files, row.file_limit = (int(x.replace(",", "")) for x in more.group(1, 2))
                row.backup, row.purged = more.group(3), int(more.group(4) or 0)
            rows.append(row)
        elif m := re.fullmatch(r"(\w+)\s+\S+\s+(\d+)\s+[\d,]+", s):  # usage details: fileset, you, GiB, files
            mine[m.group(1)] = int(m.group(2))
    return rows


def parse_storage(text: str) -> tuple[list[Storage], str]:
    """quota_info lines become Storage rows; anything else comes back as plain text."""
    sec = _sections(text)
    rows: list[Storage] = []
    account = ""
    for line in sec.get("QUOTA", []):
        s = line.strip()
        m = QUOTA_RE.search(s)
        if s.startswith("Usage for account:"):
            account = s.split(":", 1)[1].strip()
        elif s.startswith("User ") and m and rows:
            rows[-1].mine = int(m.group(1))
        elif "Storage" in s and m:
            if s.startswith("HOME"):
                rows.append(Storage("Home", int(m.group(1)), int(m.group(2) or 0), int(m.group(1))))
            else:
                kind = s.split(" Storage", 1)[0].strip().lower()
                rows.append(Storage(f"{account} {kind}".strip(), int(m.group(1)), int(m.group(2) or 0)))
    for line in sec.get("USERS", []):
        p = line.split("|")
        if len(p) != 3 or not p[2].isdigit():
            continue
        kind = "project" if "project" in p[1] else "scratch" if "scratch" in p[1] else ""
        gb = int(p[2]) / 1024 / 1024  # KB
        for r in rows:
            if kind and r.label.endswith(kind) and gb >= 0.05:
                r.people[p[0]] = r.people.get(p[0], 0) + gb
    rows = rows or parse_getquota(sec.get("QUOTA", []))
    raw = "" if rows else "\n".join(sec.get("QUOTA", [])).strip()
    return rows, raw


def storage(ssh: SshMaster, account: str) -> tuple[list[Storage], str]:
    return parse_storage(_run(ssh, STORAGE, account))


# -- load -----------------------------------------------------------------------------

def _gpus(spec: str) -> int:
    """'gpu:a100_40g:4,gpu:a100_20g:1(IDX:4)' -> 5"""
    return sum(int(m) for m in re.findall(r"gpu:[^:,]+:(\d+)", spec))


def parse_load(text: str) -> list[Partition]:
    sec = _sections(text)
    parts: dict[str, Partition] = {}
    for line in sec.get("PART", []):
        p = line.split("|")
        if len(p) != 4:
            continue
        cpu = p[3].split("/")  # allocated/idle/other/total
        name = p[0].rstrip("*")
        if len(cpu) == 4 and all(c.isdigit() for c in cpu) and p[2].isdigit():
            parts[name] = Partition(name, p[1] == "up", int(p[2]), int(cpu[0]), int(cpu[3]))
    for line in sec.get("GPU", []):
        p = line.split("|")
        part = parts.get(p[0].strip().rstrip("*")) if p else None
        if part and len(p) >= 3:
            part.gpus_total += _gpus(p[1])
            part.gpus_used += _gpus(p[2])
    for key, attr in (("PEND", "pending"), ("RUN", "running")):
        for line in sec.get(key, []):
            p = line.split()
            if len(p) == 2 and p[0].isdigit() and p[1] in parts:
                setattr(parts[p[1]], attr, int(p[0]))
    return list(parts.values())


def load(ssh: SshMaster) -> list[Partition]:
    return parse_load(ssh.run(LOAD, timeout=60).stdout)


# -- SU totals of your Slurm accounts ------------------------------------------

@dataclass
class AccountUsage:
    account: str
    quota: int  # SU (core hours) the account may use
    used: int  # SU the whole account used
    mine: int  # SU you used in it
    period: str = ""  # what used covers when it is not "all time" (Yale: the fiscal year, "FY27")
    rate: float = 0.0  # dollars billed per SU, where SU are billed instead of limited (Yale)


# SDSC keeps SU in its own accounting (expanse-client), Yale bills them per fiscal year (getusage), elsewhere
# they are Slurm limits. No exit: this runs in the long-lived shell.
USAGE = r"""if command -v expanse-client >/dev/null; then
expanse-client user -p 2>/dev/null | awk -v u="$USER" '$1 == u && $2 == "allow" {print $3 "|SU|" $6 "|" $7 "|" $5}'
elif command -v getusage >/dev/null; then
echo "@USER $USER"
for a in $(sacctmgr -n -P show assoc where user="$USER" format=account 2>/dev/null | sort -u); do
  echo "@ACCOUNT $a"; getusage -A "$a" --json 2>/dev/null
done
else
for a in $(sacctmgr -n -P show assoc where user="$USER" format=account 2>/dev/null | sort -u); do
q=$(sacctmgr -n -P show assoc where account="$a" user="" format=GrpTRESMins 2>/dev/null |
  grep -o 'billing=[0-9]*' | head -1)
u=$(sshare -n -P -A "$a" --users=" " -o GrpTRESRaw 2>/dev/null | grep -o 'billing=[0-9]*' | head -1)
m=$(sshare -n -P -A "$a" --users="$USER" -o User,RawUsage 2>/dev/null | grep "^$USER|" | cut -d'|' -f2)
echo "$a|${q#billing=}|${u#billing=}|$m"
done
fi"""


def parse_getusage(text: str) -> list[AccountUsage]:
    """Yale's getusage --json per account: SU this fiscal year, everyone's and yours, and the rate billed."""
    user, blocks, cur = "", {}, ""
    for line in text.splitlines():
        if line.startswith("@USER "):
            user = line[6:].strip()
        elif line.startswith("@ACCOUNT "):
            cur = line[9:].strip()
            blocks[cur] = []
        elif cur:
            blocks[cur].append(line)
    out = []
    for account, lines in blocks.items():
        try:
            d = json.loads("\n".join(lines))
        except ValueError:
            continue
        rows = [r for r in d.get("rows", []) if isinstance(r, dict)]
        used = sum(float(r.get("su_hours") or 0) for r in rows)
        mine = sum(float(r.get("su_hours") or 0) for r in rows if r.get("username") == user)
        out.append(AccountUsage(account, 0, round(used), round(mine), str(d.get("fy") or ""),
                                float(d.get("bill_rate") or 0)))
    return out


def parse_usage(text: str) -> list[AccountUsage]:
    if "@ACCOUNT " in text:
        return parse_getusage(text)
    out = []
    for line in text.splitlines():
        p = line.strip().split("|")
        if len(p) == 5 and p[1] == "SU" and all(x.isdigit() for x in p[2:]):  # expanse-client: SU already
            out.append(AccountUsage(p[0], int(p[2]), int(p[3]), int(p[4])))
        elif len(p) == 4 and (p[1].isdigit() or not p[1]):
            num = [int(x) if x.isdigit() else 0 for x in p[1:]]
            out.append(AccountUsage(p[0], num[0] // 60, num[1] // 60, num[2] // 3600))  # minutes, minutes, seconds
    # accounts with an SU limit; a cluster without limits (Yale) shows them all
    return [a for a in out if a.quota] or out


def account_usage(ssh: SshMaster) -> list[AccountUsage]:
    return parse_usage(ssh.run(USAGE, timeout=60).stdout)


# -- SUs per week and the pace, for the cards on the Usage page --------------------------------------------------

WEEKS = 12

# One sacct for all your groups on the cluster: SUs (Slurm's billing times the time run) summed per group, start
# day and QoS, and per group, person and QoS over the same 12 weeks. The QoS usage factor is applied here in Python.
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


def parse_weekly(text: str) -> dict[str, Weekly] | None:
    """Per group (lowercase): SUs per week and per person. None when sacct could not answer."""
    sec = _sections(text)
    rc = re.search(r"^@RC (\d+)", text, re.M)
    try:
        today = date.fromisoformat((sec.get("TODAY") or [""])[0].strip())
    except ValueError:
        return None
    if not rc or rc.group(1) != "0":
        return None
    factor = {}
    for line in sec.get("QOS", []):
        p = line.split("|")
        try:
            factor[p[0]] = float(p[1])
        except (IndexError, ValueError):
            pass
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
CACHE_SECONDS = 600


def weekly(ssh: SshMaster, cluster: str, accounts: list[str], fresh: bool = False,
           paid: str = "") -> dict[str, Weekly] | None:
    """The 12 weeks of every group, kept for 10 minutes (fresh: ask again). paid: only jobs on partitions starting
    with these count (Yale's priority ones); "" = all."""
    key = (cluster, ",".join(sorted(accounts)))
    hit = _weekly_cache.get(key)
    if hit and not fresh and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    got = parse_weekly(_run(ssh, WEEKLY, key[1], paid)) if accounts else {}
    _weekly_cache[key] = (time.monotonic(), got)
    return got


@dataclass
class Allocation(AccountUsage):
    """A group you can bill, with its last 12 weeks and where this pace leads."""
    weeks: list[float] | None = None  # SUs per week, oldest first; None = the cluster could not tell
    people: dict[str, float] = field(default_factory=dict)  # user -> SUs over the 12 weeks
    per_day: float | None = None  # SUs a day over the last 4 weeks; None = not known
    days_left: float | None = None  # at that pace; None = no limit, nothing used lately, or not known
    runs_out: str = ""  # the day it runs out at that pace (ISO), "" = see days_left
    end: str = ""  # when the allocation period ends, as the cluster's tool says (ISO); "" = not said
    near: bool = False  # runs out before the period ends, or (end not known) within 30 days, or used up


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
    """Every group you can bill here with its SUs, last 12 weeks and pace. Weeks None: sacct could not answer."""
    groups = account_usage(ssh)
    weeks = weekly(ssh, cluster, [a.account for a in groups], fresh, paid) if groups else {}
    today = date.today()
    return [pace(a, None if weeks is None else weeks.get(a.account.lower(), Weekly([0.0] * WEEKS)), today)
            for a in groups]
