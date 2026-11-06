import re
from dataclasses import dataclass, field

from ...core.ssh import SshMaster
from .sections import run_script, sections

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

QUOTA_RE = re.compile(r"(\d+) GB(?: \(of (\d+) GB quota\))?")


@dataclass
class Storage:
    label: str
    used: int  # GB
    quota: int = 0  # GB, 0 = no quota
    mine: int | None = None  # GB you use in it
    people: dict[str, float] = field(default_factory=dict)  # user -> GB
    files: int = 0  # 0 = not known
    file_limit: int = 0
    backup: str = ""  # Yes or No as the quota tool says, "" = not said
    purged: int = 0  # days before files are deleted, 0 = never or not said (Yale's getquota)


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
    """quota_info (or getquota) lines as rows; output of any other tool comes back as plain text."""
    sec = sections(text)
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
    return parse_storage(run_script(ssh, STORAGE, account))
