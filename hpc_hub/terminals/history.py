"""Reading a tmux session's history for the rail: a bounded window of its lines, and a small map of all of it.
Read only and safe to repeat; nothing here runs until you look at the rail or the reading view. A session's lines
are counted from the top of its history (0 is the oldest kept line), so tmux's own numbers (0 is the first visible
line, below that history) never leave this file."""

import shlex

from ..core.ssh import SshMaster
from .tmux import _opt, on

WINDOW = 200  # lines answered at once, by default
WINDOW_MAX = 500
BUCKETS = 300  # rows in the map, by default
BUCKETS_MAX = 1000
GONE = "@@GONE"
TIMEOUT = 20
META = "#{history_size} #{history_limit} #{pane_height} #{pane_width} #{alternate_on} #{pane_in_mode}"

# One row of the map: blank, text, table, or a prompt: Claude's and Codex's own echo of what you typed, or a shell
# prompt ("jdoe@login1:~$ "). Prompt shapes can change with an agent's version; a miss only leaves it off the rail.
OUTLINE_AWK = r"""
BEGIN { p = 0 }
{
  i = NR - 1
  b = int(i * n / total)
  if (b >= n) b = n - 1
  line = $0
  if (length(line) > l[b]) l[b] = length(line)
  rank = line ~ /[^ ]/ ? 1 : 0
  if (index(line, "│") || index(line, "┌") || index(line, "└") || index(line, "├") || line ~ /\|.*\|.*\|/) rank = 2
  if (line ~ /^ *(❯|›|>)( |$)/ || line ~ /^[A-Za-z0-9_.-]+@[A-Za-z0-9._-]+[^ ]*[$#%] /) { rank = 3; prompts[p++] = i }
  if (rank > k[b]) k[b] = rank
}
END {
  printf "BUCKETS"
  for (b = 0; b < n; b++) printf " %d %d", k[b] + 0, l[b] + 0
  printf "\nPROMPTS"
  for (i = (p > 300 ? p - 300 : 0); i < p; i++) printf " %d", prompts[i]
  printf "\n"
}
"""


def read(ssh: SshMaster, node: str, line: str, timeout: float = TIMEOUT):
    """On the session's node through the shell kept open there, or ssh from the login node. Read only."""
    if node:
        res = ssh.run_on_host(node, line, timeout=timeout)
        if res is not None:
            return res
    return ssh.on_login(on(node, line), timeout=timeout)


def with_meta(name: str, body: str) -> str:
    """body runs if the session's still there, with $H (history lines) and $T (all lines, history plus screen), after
    a first line with the pane's facts. Otherwise answers GONE. One shell line, one round trip."""
    t = _opt(name)
    return (f"if tmux has-session -t {t} 2>/dev/null && m=$(tmux display-message -p -t {t} {shlex.quote(META)}); "
            f"then printf '%s\\n' \"$m\"; ( set -- $m; H=$1; T=$(($1+$3)); {body} ); else echo {GONE}; fi")


def _ints(line: str) -> list[int]:
    return [int(x) for x in line.split()]


def window_line(name: str, start: int | None, count: int) -> str:
    """Lines [start, start+count) of the history (colors included); the last count lines when start is None."""
    t = _opt(name)
    s = "$((T-c))" if start is None else str(int(start))
    return with_meta(name, f"c={int(count)}; s={s}; [ \"$s\" -lt 0 ] && s=0; [ \"$s\" -ge \"$T\" ] && s=$((T-1)); "
                           f"tmux capture-pane -p -e -t {t} -S $((s-H)) -E $((s+c-1-H))")


def _head(line: str) -> dict:
    h, limit, height, width, alternate, mode = (_ints(line) + [0] * 6)[:6]
    return {"total": h + height, "history": h, "limit": limit, "height": height, "width": width,
            "alternate": bool(alternate), "in_mode": bool(mode)}


def parse_window(stdout: str, start: int | None, count: int) -> dict:
    lines = stdout.split("\n")
    if not lines or lines[0].strip() == GONE:
        return {"gone": True}
    meta = _head(lines[0])
    rows = lines[1:]
    if rows and rows[-1] == "":
        rows.pop()
    total = meta["total"]
    first = max(total - count, 0) if start is None else min(max(int(start), 0), max(total - 1, 0))
    return {"start": first, "rows": rows, **meta}


def window(ssh: SshMaster, session: str, node: str, start: int | None, count: int) -> dict:
    count = max(1, min(int(count), WINDOW_MAX))
    res = read(ssh, node, window_line(session, start, count))
    if res.returncode != 0 and GONE not in res.stdout:
        raise RuntimeError(res.stderr.strip() or "Could not read this session's history")
    return parse_window(res.stdout, start, count)


def outline_line(name: str, buckets: int) -> str:
    t = _opt(name)
    return with_meta(name, f"tmux capture-pane -p -t {t} -S - | LC_ALL=C awk -v n={int(buckets)} -v total=\"$T\" "
                           f"{shlex.quote(OUTLINE_AWK)}")


def parse_outline(stdout: str) -> dict:
    lines = stdout.split("\n")
    if not lines or lines[0].strip() == GONE:
        return {"gone": True}
    meta = _head(lines[0])
    by = {w.split(" ", 1)[0]: w.split(" ", 1)[1] if " " in w else "" for w in lines[1:] if w}
    nums = _ints(by.get("BUCKETS", ""))
    return {**meta, "map": [[nums[i], nums[i + 1]] for i in range(0, len(nums) - 1, 2)],
            "prompts": _ints(by.get("PROMPTS", ""))}


def outline(ssh: SshMaster, session: str, node: str, buckets: int) -> dict:
    buckets = max(1, min(int(buckets), BUCKETS_MAX))
    res = read(ssh, node, outline_line(session, buckets), timeout=45)
    if res.returncode != 0 and GONE not in res.stdout:
        raise RuntimeError(res.stderr.strip() or "Could not read this session's history")
    return parse_outline(res.stdout)
