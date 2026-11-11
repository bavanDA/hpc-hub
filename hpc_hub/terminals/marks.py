"""Named places in a terminal's history, shared by every device signed in to the cluster. They live in
~/.hpc-hub/marks/<session>.json with the text of the marked lines, so a mark outlives the job and tmux trimming its
history. Finding one again is read only: its lines are matched against the history as it is now."""

import base64
import json
import re
import secrets
import shlex
import threading
import time

from ..core.ssh import SshMaster
from . import history
from .tmux import _opt

FOLDER = ".hpc-hub/marks"  # under $HOME on the cluster
MAX_MARKS = 50
MAX_TEXT = 8000  # characters of saved text in one mark
MAX_ROWS = 400
SIG = 40  # bytes of a row a mark looks for
SEP = "\x1f"
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def _file(session: str) -> str:
    return f'"$HOME"/{shlex.quote(FOLDER + "/" + re.sub(r"[^A-Za-z0-9_.-]", "_", session) + ".json")}'


def _lock(session: str) -> threading.Lock:
    with _guard:
        return _locks.setdefault(session, threading.Lock())


def load(ssh: SshMaster, session: str) -> list[dict]:
    res = ssh.on_login(f"f={_file(session)}; if [ -f \"$f\" ]; then cat \"$f\"; fi; true", timeout=15)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Could not read the marks")
    try:
        data = json.loads(res.stdout)
    except ValueError:
        return []  # no file yet (or a torn one): start over rather than break the terminal
    found = (data.get("marks") if isinstance(data, dict) else []) or []
    return [m for m in found if isinstance(m, dict) and m.get("id")]


def save(ssh: SshMaster, session: str, marks: list[dict]) -> None:
    data = base64.b64encode(json.dumps({"version": 1, "marks": marks}).encode()).decode()
    line = (f"f={_file(session)}; mkdir -p \"$(dirname \"$f\")\" && printf %s {data} | base64 -d > \"$f.$$\" && "
            f"mv -f \"$f.$$\" \"$f\"")
    res = ssh.on_login(line, timeout=20)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Could not save the mark")


def _clean(text: str) -> str:
    return "\n".join(r.rstrip() for r in text.split("\n"))[:MAX_TEXT]


def add(ssh: SshMaster, session: str, name: str, line: int, rows: int, text: str) -> dict:
    text = _clean(text)
    if not text.strip():
        raise ValueError("Nothing to mark on that line")
    mark = {"id": secrets.token_hex(4), "name": name.strip() or "Mark", "line": max(0, int(line)),
            "rows": max(1, min(int(rows), MAX_ROWS)), "text": text, "created": int(time.time())}
    with _lock(session):
        marks = load(ssh, session)
        if len(marks) >= MAX_MARKS:
            raise RuntimeError("This session has too many marks. Remove one first")
        save(ssh, session, [*marks, mark])
    return mark


def rename(ssh: SshMaster, session: str, mark_id: str, name: str) -> None:
    if not name.strip():
        raise ValueError("Give it a name")
    with _lock(session):
        marks = load(ssh, session)
        for m in marks:
            if m["id"] == mark_id:
                m["name"] = name.strip()
        save(ssh, session, marks)


def remove(ssh: SshMaster, session: str, mark_id: str) -> None:
    with _lock(session):
        save(ssh, session, [m for m in load(ssh, session) if m["id"] != mark_id])


def _prefix(row: str) -> str:
    """The row's start, at most SIG bytes, whole characters only (awk counts bytes here), no spaces at its end."""
    raw = row.encode()[:SIG]
    while raw and (raw[-1] & 0xC0) == 0x80:  # dropped the head of a character: drop its tail too
        raw = raw[:-1]
    return raw.decode("utf-8", "ignore").rstrip().rstrip("█")


def signature(text: str) -> tuple[str, int, str, int]:
    """Two rows to look for, the wordiest ones, and where each sits in the mark: the first row plus the second keep
    a line that repeats (a separator, a progress bar) from matching a different place."""
    rows = text.split("\n")
    order = sorted(range(len(rows)), key=lambda i: -sum(c.isalnum() for c in rows[i]))
    best = order[0]
    other = next((i for i in order[1:] if sum(c.isalnum() for c in rows[i]) > 0), None)
    return _prefix(rows[best]), best, _prefix(rows[other]) if other is not None else "", other or 0


FIND_AWK = r"""
BEGIN { n = split(p, s, "\037"); m = int(n / 4) }
{ r[NR] = $0 }
END {
  for (i = 0; i < m; i++) {
    a = s[4 * i + 1]; oa = s[4 * i + 2] + 0; b = s[4 * i + 3]; ob = s[4 * i + 4] + 0; c = 0
    for (x = 1; x <= NR && c < 80; x++) {
      if (index(r[x], a) != 1) continue
      top = x - oa
      ok = (b == "")
      if (!ok) for (d = -3; d <= 3 && !ok; d++) if (index(r[top + ob + d], b) == 1) ok = 1
      if (ok) { print i, top - 1; c++ }
    }
  }
}
"""


def find_line(session: str, marks: list[dict]) -> str:
    """Hits for each mark: "<mark index> <top line>". Reads the whole history there, sends back only numbers."""
    pats = SEP.join(SEP.join((a.replace("\\", "\\\\"), str(oa), b.replace("\\", "\\\\"), str(ob)))
                    for a, oa, b, ob in (signature(m.get("text", "")) for m in marks))
    t = _opt(session)
    return history.with_meta(session, f"tmux capture-pane -p -t {t} -S - | LC_ALL=C awk -v p={shlex.quote(pats)} "
                                      f"{shlex.quote(FIND_AWK)}")


def resolve(ssh: SshMaster, session: str, node: str, marks: list[dict]) -> dict:
    """The marks in history order, each with its line as things are now and live (false: only its saved text is left).
    ended: the session itself is gone."""
    if not marks:
        return {"marks": [], "ended": False}
    res = history.read(ssh, node, find_line(session, marks), timeout=45)
    text = res.stdout
    if res.returncode != 0 and history.GONE not in text:
        raise RuntimeError(res.stderr.strip() or "Could not check the marks")
    ended = text.split("\n", 1)[0].strip() == history.GONE
    hits: dict[int, list[int]] = {}
    for line in text.split("\n")[1:]:
        parts = line.split()
        if len(parts) == 2 and all(x.lstrip("-").isdigit() for x in parts):
            hits.setdefault(int(parts[0]), []).append(int(parts[1]))
    out = []
    for i, m in enumerate(marks):
        best = min((x for x in hits.get(i, []) if x >= 0), key=lambda x: abs(x - int(m.get("line", 0))), default=None)
        out.append({**m, "live": best is not None, "line": best if best is not None else m.get("line", 0)})
    out.sort(key=lambda m: (not m["live"], m["line"]))
    return {"marks": out, "ended": ended}
