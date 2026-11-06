import json
from dataclasses import dataclass

from ...core.ssh import SshMaster

# SDSC keeps SUs in expanse-client, Yale bills them per fiscal year (getusage), elsewhere they are Slurm limits.
# No exit: this runs in the long-lived shell.
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


@dataclass
class AccountUsage:
    account: str
    quota: int  # SU (core hours) the account may use
    used: int  # SU the whole account used
    mine: int  # SU you used in it
    period: str = ""  # what used covers when it is not all time (Yale: the fiscal year, "FY27")
    rate: float = 0.0  # dollars billed per SU, where SUs are billed instead of limited (Yale)


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
