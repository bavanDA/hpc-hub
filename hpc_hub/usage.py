"""Group SU usage per person, storage quotas and cluster load, for the Usage page."""

import re
import shlex
from dataclasses import dataclass, field

from .core.ssh import SshMaster

PERIODS = [("Last 7 days", 7), ("Last 30 days", 30), ("Last 90 days", 90), ("Last year", 365)]

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


USAGE = r"""for a in $(sacctmgr -n -P show assoc where user="$USER" format=account 2>/dev/null | sort -u); do
q=$(sacctmgr -n -P show assoc where account="$a" user="" format=GrpTRESMins 2>/dev/null | grep -o 'billing=[0-9]*' | head -1)
[ -n "$q" ] || continue
u=$(sshare -n -P -A "$a" --users=" " -o GrpTRESRaw 2>/dev/null | grep -o 'billing=[0-9]*' | head -1)
m=$(sshare -n -P -A "$a" --users="$USER" -o User,RawUsage 2>/dev/null | grep "^$USER|" | cut -d'|' -f2)
echo "$a|${q#billing=}|${u#billing=}|$m"
done"""


def parse_usage(text: str) -> list[AccountUsage]:
    out = []
    for line in text.splitlines():
        p = line.strip().split("|")
        if len(p) == 4 and p[1].isdigit():
            num = [int(x) if x.isdigit() else 0 for x in p[1:]]
            out.append(AccountUsage(p[0], num[0] // 60, num[1] // 60, num[2] // 3600))  # minutes, minutes, seconds
    return out


def account_usage(ssh: SshMaster) -> list[AccountUsage]:
    return parse_usage(ssh.run(USAGE, timeout=30).stdout)
