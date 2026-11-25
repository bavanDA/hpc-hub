"""Continue on an ended ChatGPT (Codex) tab (2026-11-25, the owner: "where is the continue button"): the Codex chat
the tab had, found on the cluster also after its session and its job ended, so codex resume picks it up.

Codex picks a new chat's id itself and saves it as ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl, the
first line a session_meta record {id, cwd, timestamp}. tools.agent_start names the tab hpchub-codex-<job>-<tag>:
- tag = the chat id's first 8 characters when it resumed a chat. Codex's ids start with the time (UUIDv7), so
  chats started within a minute of each other share them: the one written during the tab's job is it.
- tag = HHMMSS, this computer's clock when it started a new one. The chat is the one Codex started then: the first
  after that moment (on a day the job ran, from sacct) and within minutes of it, best in the folder the tab's title
  names. A chat started later is some later tab's, also in the same folder."""

import json
import posixpath
import re
import shlex
from dataclasses import dataclass
from datetime import datetime, timedelta, tzinfo

from ..core.ssh import SshMaster

TAB = re.compile(r"^hpchub-codex-(?:(\d+)-)?([0-9a-f]{8}|\d{6})$")
SKEW = 120  # seconds this computer's clock and the cluster's may differ
STARTUP = 300  # Codex starts its chat within this long of the tab (a cold start, an update and a restart)
NONE = "Codex saved no chat for this tab: it may have ended before you sent a message. Start a new one"

# Runs on the cluster (python3 3.6+). argv: tag, job id ("" for none). Prints one JSON object: the job's start and
# end (epoch seconds, from sacct; 0 when unknown), the cluster's clock, and the rollouts that may be the tab's.
SCRIPT = r'''
import calendar, glob, json, os, re, subprocess, sys, time
tag, job = sys.argv[1], sys.argv[2]
now = int(time.time())
start = end = 0
if job:
    try:
        env = dict(os.environ, SLURM_TIME_FORMAT="%s")
        out = subprocess.check_output(["sacct", "-j", job, "-X", "-n", "-P", "-o", "Start,End"], env=env,
                                      stderr=subprocess.DEVNULL).decode("utf-8", "replace").split()
        if out:
            parts = (out[0].split("|") + ["", ""])[:2]
            start = int(parts[0]) if parts[0].isdigit() else 0
            end = int(parts[1]) if parts[1].isdigit() else 0
    except (OSError, subprocess.CalledProcessError, ValueError):
        pass
root = os.path.realpath(os.path.expanduser("~/.codex/sessions"))
hexed = len(tag) == 8
since = (start or now - 3 * 86400) - 86400
found = []
for path in glob.glob(os.path.join(root, "*", "*", "*", "rollout-*.jsonl")):
    name = os.path.basename(path)
    m = re.match(r"rollout-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d)-([0-9a-fA-F-]{36})\.jsonl$", name)
    if not m or not os.path.realpath(path).startswith(root + os.sep):
        continue
    cid = m.group(2).lower()
    try:
        mtime = int(os.path.getmtime(path))
    except OSError:
        continue
    if (hexed and not cid.startswith(tag)) or (not hexed and mtime < since):
        continue
    meta = {}
    try:
        with open(path, "rb") as f:
            line = json.loads(f.readline(8 << 20).decode("utf-8", "replace"))
        if isinstance(line, dict) and line.get("type") == "session_meta" and isinstance(line.get("payload"), dict):
            meta = line["payload"]
    except (OSError, ValueError):
        pass
    try:
        ts = calendar.timegm(time.strptime(str(meta.get("timestamp", ""))[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        ts = int(time.mktime(time.strptime(m.group(1), "%Y-%m-%dT%H-%M-%S")))  # the name has local time
    cwd = meta.get("cwd") if isinstance(meta.get("cwd"), str) else ""
    found.append({"id": str(meta.get("id") or cid), "ts": ts, "mtime": mtime, "cwd": cwd})
print(json.dumps({"start": start, "end": end, "now": now, "chats": found}))
'''


@dataclass
class Rollout:
    id: str
    ts: int  # when Codex started the chat
    mtime: int  # when it last wrote to it
    cwd: str


def parse_tab(session: str) -> tuple[str, str]:
    """(job id, tag) of a ChatGPT tab HPC Hub started; ValueError for any other tab."""
    m = TAB.match(session)
    if not m:
        raise ValueError("Not a ChatGPT chat started by HPC Hub")
    return m.group(1) or "", m.group(2)


def folder_of(title: str) -> str:
    """The folder name a tab's title gives ("ChatGPT · thesis"): "" when it names none to compare with."""
    name = re.sub(r"^ChatGPT\s*·\s*", "", title or "").strip()
    return "" if name in ("", "~") else name


def _same_folder(r: Rollout, folder: str) -> bool:
    return bool(folder) and posixpath.basename(r.cwd.rstrip("/")) == folder


def moments(hhmmss: str, start: int, end: int, tz: tzinfo | None = None) -> list[int]:
    """Every moment from start to end (epoch seconds) this computer's clock (tz; None: its own zone) read hhmmss:
    the tab started at one of them, on a day its job ran."""
    h, m, s = int(hhmmss[:2]), int(hhmmss[2:4]), int(hhmmss[4:])
    if h > 23 or m > 59 or s > 59:
        return []
    first = datetime.fromtimestamp(start - SKEW, tz)
    at = first.replace(hour=h, minute=m, second=s, microsecond=0)
    if at < first:
        at += timedelta(days=1)
    out = []
    while at.timestamp() <= end + SKEW and len(out) < 400:
        out.append(int(at.timestamp()))
        at += timedelta(days=1)
    return out


def pick(tag: str, chats: list[Rollout], start: int, end: int, folder: str = "",
         tz: tzinfo | None = None) -> Rollout | None:
    """The tab's chat among the rollouts the script found; None when none is it. start/end: the tab's job (or the
    days before now when sacct has no job)."""
    if len(tag) == 8:  # resumed: Codex kept writing to that chat while the job ran
        ours = [c for c in chats if c.id.startswith(tag)]
        if not ours:
            return None
        return min(ours, key=lambda c: (start and c.mtime < start - SKEW, not _same_folder(c, folder), -c.mtime))
    starts = moments(tag, start, end, tz)
    best: tuple | None = None
    for c in chats:
        began = [t for t in starts if t - SKEW <= c.ts <= end + SKEW]
        if not began:
            continue
        gap = max(0, c.ts - max(began))
        if gap > STARTUP:  # long after the tab began: some later tab's, even in the same folder
            continue
        key = (not _same_folder(c, folder), gap)
        if best is None or key < best[0]:
            best = (key, c)
    return best[1] if best else None


def where(ssh: SshMaster, session: str, title: str = "", tz: tzinfo | None = None) -> dict:
    """{chat_id, folder} of an ended ChatGPT tab, for codex resume in the same folder. title: the tab's, which
    names its folder."""
    job, tag = parse_tab(session)
    res = ssh.run(f"python3 -c {shlex.quote(SCRIPT)} {shlex.quote(tag)} {shlex.quote(job)}", timeout=60)
    try:
        data = json.loads(res.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not find the chat")
    now = int(data.get("now") or 0)
    start, end = int(data.get("start") or 0), int(data.get("end") or 0)
    if not start:  # no job, or sacct no longer knows it: the days before now
        start, end = now - 3 * 86400, now
    elif not end:  # the job still runs (the tab ended, the job didn't)
        end = now
    chats = [Rollout(str(c.get("id", "")), int(c.get("ts") or 0), int(c.get("mtime") or 0), str(c.get("cwd") or ""))
             for c in data.get("chats") or [] if isinstance(c, dict) and c.get("id")]
    found = pick(tag, chats, start, end, folder_of(title), tz)
    if not found:
        raise RuntimeError(NONE)
    return {"chat_id": found.id, "folder": found.cwd}

