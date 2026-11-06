"""The scan: one small Slurm job that walks scratch once (metadata only: find never opens a file), sums it up with
summarize.py and, when asked, lets an agent look at the folders (agent.py). Everything it writes stays in
~/.hpc-hub/backup/<id>/ in your home; nothing is written to, moved in or touched in scratch.

The job is gentle on the shared filesystem: one walker, lowest CPU and disk priority, a time limit (a scan that
runs out says it is partial), and on Lustre with millions of files a candidate list from lfs find instead of a
full walk."""

import json
import re
import secrets
import shlex
import time
from dataclasses import replace
from pathlib import Path

from ..compute import limits, slurm
from ..core.config import ComputeProfile
from .model import Purge

ROOT = ".hpc-hub/backup"  # under $HOME
JOB_PREFIX = "hpc-hub-backup-scan-"
ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
STATES = ("starting", "waiting_for_node", "scanning", "thinking", "done", "failed", "cancelled")
SCAN_MINUTES = 90
LFS_CANDIDATES = 3_000_000  # more files than this on Lustre: lfs find picks candidates instead of a full walk
FIELDS = r"%A@\037%T@\037%C@\037%B@\037%s\037%b\037%n\037%y\037%l\037%P\000"
HERE = Path(__file__).parent
LOCAL_IMPORT = re.compile(r"^from hpc_hub\.backup\.\w+ import .*# local only.*\n", re.M)


def new_id(now: float | None = None) -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "-" + secrets.token_hex(2)


def check_id(scan_id: str) -> str:
    if not ID.match(scan_id or ""):
        raise ValueError(f"Not a backup id: {scan_id!r}")
    return scan_id


def folder(scan_id: str) -> str:
    return f'"$HOME"/{ROOT}/{check_id(scan_id)}'


def remote_source(*names: str) -> str:
    """Modules pasted into one script for the cluster, the local-only imports between them dropped."""
    return "\n".join(LOCAL_IMPORT.sub("", (HERE / f"{n}.py").read_text()) for n in names)


def job_profile(base: ComputeProfile, cluster_id: str, minutes: int = SCAN_MINUTES) -> ComputeProfile:
    """1 core, 2 GB on the queue the cluster's node settings use; Expanse needs nodes that see Lustre."""
    extra = base.extra_args
    if cluster_id == "sdsc" and "lustre" not in extra:
        extra = (extra + " --constraint=lustre").strip()
    return replace(base, cpus=1, mem_gb=2, gpus=0, time=limits.slurm_time(minutes), extra_args=extra)


def walk_command(scratch: str, group: bool, purge: Purge, horizon: int, expected: int, seconds: int) -> str:
    """find over scratch (or lfs find's candidates on big Lustre scratch), records on stdout."""
    user = "" if group else ' -user "$USER"'
    find = f'timeout {int(seconds)} find -P "$S" -xdev{user} \\( -type f -o -type l \\) -printf {shlex.quote(FIELDS)}'
    if purge.days <= 0 or expected <= LFS_CANDIDATES:
        return find
    # anything one of its dates says could go within the horizon; one pass per date, merged
    age = max(purge.days - horizon - 1, 0)
    lfs_user = "" if group else ' --user "$USER"'
    picks = " ".join(f'lfs find "$S" --type f{lfs_user} --{d} +{age} -0 2>/dev/null;' for d in ("atime", "mtime",
                                                                                              "ctime"))
    printf = shlex.quote(FIELDS.replace("%P", "%p"))
    return (f'if command -v lfs >/dev/null && findmnt -n -t lustre -T "$S" >/dev/null 2>&1; then '
            f"{{ {picks} }} | sort -zu | timeout {int(seconds)} xargs -0 -r sh -c "
            f"'find -P \"$@\" -maxdepth 0 -printf \"$0\"' {printf}; else {find}; fi")


def script(scan_id: str, scratch: str, purge: Purge, horizon: int, profile: ComputeProfile, *, group: bool = False,
           expected: int = 0, agent_cmd: str = "") -> str:
    """The batch script. agent_cmd: the agent once, headless, run in context/ (agent.py builds both)."""
    head = ["#!/bin/bash -l", f"#SBATCH --job-name={JOB_PREFIX}{scan_id}", "#SBATCH --output=slurm.out",
            *[f"#SBATCH {a}" for a in slurm.resource_args(profile)], "", f"ID={shlex.quote(check_id(scan_id))}",
            f"DIR={folder(scan_id)}"]
    return "\n".join(head + body(scratch, purge, horizon, group=group, expected=expected, agent_cmd=agent_cmd))


def body(scratch: str, purge: Purge, horizon: int, *, group: bool = False, expected: int = 0,
         agent_cmd: str = "") -> list[str]:
    """The scan itself, for a job script that has set ID and DIR (the folder exists, summarize.py is in it)."""
    seconds = SCAN_MINUTES * 60 - 600  # leave time to sum up and for the agent
    summarize = (f'python3 -I "$DIR/summarize.py" --now "$(date +%s)" --days {int(purge.days)} '
                 f'--basis {shlex.quote(purge.basis)} --horizon {int(horizon)} --depth 3 --scratch "$S" '
                 f'--busy "$DIR/busy.txt" --expected {int(expected)} --out "$DIR" --id "$ID"')
    lines = [
        f"S={shlex.quote(scratch)}",
        "renice -n 19 $$ >/dev/null 2>&1; ionice -c3 -p $$ >/dev/null 2>&1",
        'state() { echo "$1" > "$DIR/state.tmp" && mv -f "$DIR/state.tmp" "$DIR/state"; }',
        'trap \'state cancelled; exit 1\' TERM',
        "state scanning",
        'squeue -u "$USER" -h -t R -o %Z > "$DIR/busy.txt" 2>/dev/null',
        f'{{ {walk_command(scratch, group, purge, horizon, expected, seconds)} 2>"$DIR/find.err"; '
        f'echo $? > "$DIR/find.rc"; }} | {summarize} || {{ state failed; exit 1; }}',
    ]
    if agent_cmd:
        from .agent import PROMPT
        lines += [
            "state thinking",
            f'printf %s {shlex.quote(_b64(remote_source("context")))} | base64 -d > "$DIR/context.py"',
            f'printf %s {shlex.quote(_b64(PROMPT))} | base64 -d > "$DIR/prompt.md"',
            'python3 -I "$DIR/context.py" "$S" "$DIR" > "$DIR/context.log" 2>&1',
            'OUT="$DIR"',
            f'(cd "$DIR/context" && {agent_cmd}) > "$DIR/agent.log" 2>&1',
        ]
    return lines + ["state done", ""]


def _b64(text: str) -> str:
    import base64
    return base64.b64encode(text.encode()).decode()


def start_command(scan_id: str, meta: dict, job: str) -> str:
    """Write the scan's folder (meta, summarize.py, the job) and submit it; prints the job id."""
    d = folder(scan_id)
    return " && ".join([
        f"mkdir -p {d}",
        f"cd {d}",
        f"printf %s {shlex.quote(_b64(json.dumps(meta)))} | base64 -d > meta.json",
        f"printf %s {shlex.quote(_b64(remote_source('classify', 'summarize')))} | base64 -d > summarize.py",
        f"printf %s {shlex.quote(_b64(job))} | base64 -d > scan.sbatch",
        "echo starting > state",
        "sbatch --parsable scan.sbatch | tee job_id",
    ])


def cancel_command(scan_id: str) -> str:
    d = folder(scan_id)
    return (f'[ -f {d}/job_id ] && scancel "$(cat {d}/job_id)" 2>/dev/null; '
            f'echo cancelled > {d}/state.tmp && mv -f {d}/state.tmp {d}/state')


SEP = "\x1e"


def list_command(limit: int = 10) -> str:
    """The newest scans: meta, state, progress, each record ended by SEP."""
    return (f'cd "$HOME"/{ROOT} 2>/dev/null || exit 0; '
            f"for d in $(ls -1d */ 2>/dev/null | sort -r | head -n {int(limit)}); do "
            f'[ -f "$d/meta.json" ] && [ -f "$d/scan.sbatch" ] || continue; '
            "cat \"$d/meta.json\"; printf '\\037'; cat \"$d/state\" 2>/dev/null; printf '\\037'; "
            "cat \"$d/progress.json\" 2>/dev/null; printf '\\037'; cat \"$d/find.rc\" 2>/dev/null; "
            f"printf '{SEP}'; done")


def parse_list(text: str) -> list[dict]:
    out = []
    for rec in text.split(SEP):
        parts = rec.split("\x1f")
        if len(parts) != 4:
            continue
        try:
            meta = json.loads(parts[0])
        except ValueError:
            continue
        try:
            progress = json.loads(parts[2]) if parts[2].strip() else {}
        except ValueError:
            progress = {}
        state = parts[1].strip() or "starting"
        out.append({**meta, "state": state if state in STATES else "failed", "progress": progress,
                    "partial": parts[3].strip() == "124", "detail": detail(state, progress)})
    return out


def detail(state: str, progress: dict) -> str:
    if state == "starting":
        return "Waiting for a node"
    if state == "scanning":
        n, e = progress.get("checked", 0), progress.get("expected", 0)
        return f"Checked {n:,} of about {e:,} files" if e else f"Checked {n:,} files"
    if state == "thinking":
        return "The agent is reading your folders"
    if state == "done":
        return "Done"
    if state == "cancelled":
        return "Stopped"
    return "The scan didn't finish"


def fetch_command(scan_id: str, name: str) -> str:
    """One of the scan's small result files (summary.json, plan.agent.json, context/index.json)."""
    if name not in ("summary.json", "plan.agent.json", "progress.json", "context/index.json", "dry.json",
                    "result.json", "copy.state"):
        raise ValueError(f"No file {name}")
    return f"cat {folder(scan_id)}/{name} 2>/dev/null"
