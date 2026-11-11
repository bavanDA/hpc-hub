from dataclasses import dataclass

from ...core.ssh import SshMaster
from .sections import qos_factors, run_script, sections

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


@dataclass
class Person:
    user: str
    name: str = ""
    charged: float = 0.0  # SU billed, the QoS usage factor applied
    hours: float = 0.0  # all core hours, free QoS included


def parse_group(text: str, per_su: int = 1) -> list[Person]:
    sec = sections(text)
    factor = qos_factors(sec.get("QOS", []))
    people: dict[str, Person] = {}
    for line in sec.get("NAMES", []):
        p = line.split("|")
        if p[0]:
            people[p[0]] = Person(p[0], p[1] if len(p) > 1 else "")
    for line in sec.get("JOBS", []):
        p = line.split("|")
        if len(p) != 3 or not p[0]:
            continue
        hours = float(p[2]) / per_su
        who = people.setdefault(p[0], Person(p[0]))
        who.hours += hours
        who.charged += hours * factor.get(p[1], 1.0)
    return sorted(people.values(), key=lambda x: (-x.charged, -x.hours, x.user))


def group_usage(ssh: SshMaster, account: str, days: int, per_su: int = 1) -> list[Person]:
    return parse_group(run_script(ssh, GROUP, account, str(int(days))), per_su)
