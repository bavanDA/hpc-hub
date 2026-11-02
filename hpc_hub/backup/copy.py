"""The trial run, the copy and its check: Slurm jobs from fixed templates (the agent never writes commands).

rsync copies the plan's files from scratch into <project>/from-scratch/, keeping the folders as they are in
scratch, so later runs only add what changed. What it may do is a short allow list (check_flags); nothing that
deletes (no --delete*, no --remove-source-files), nothing that follows links (no -L). A newer file in project is
never overwritten (--update); a file that does get replaced goes to .hpc-hub-replaced/<date>/ first.

Before copying the job checks again that the plan is the one the trial run checked, that the copy fits in the
destination's free space, and that the destination is a from-scratch folder outside scratch."""

import json
import re
import shlex

from ..compute import slurm
from ..compute.jobs import duration_text
from ..core.config import ComputeProfile
from .model import Progress, Result
from .plan import FROM_SCRATCH
from .scan import _b64, folder, job_profile, remote_source

JOB_PREFIX = "hpc-hub-backup-copy-"
COPY_MINUTES = 12 * 60
DRY_MINUTES = 60
RESUBMITS = 5
CHECKSUM_UP_TO = 500 * 1024 ** 3  # above this the check compares size and date instead of every byte
SPACE_MARGIN = 0.95
STATES = ("filtering", "trying", "tried", "copying", "verifying", "resubmitted", "done", "failed", "cancelled")

ALLOWED = {"-r", "-l", "-p", "-t", "-n", "-i", "-H", "--sparse", "--update", "--backup", "--partial", "--from0",
           "--stats", "--itemize-changes", "--checksum", "--info=progress2,stats2"}
ALLOWED_PREFIX = ("--backup-dir=", "--partial-dir=", "--files-from=", "--log-file=")
FORBIDDEN = ("--delete", "--del", "--remove-source-files", "--remove-sent-files", "-L", "--copy-links",
             "--copy-dirlinks", "-k", "--copy-unsafe-links", "--inplace", "--append", "-a", "--archive",
             "-o", "-g", "--chown", "--chmod")


def check_flags(argv: list[str]) -> list[str]:
    """argv's options are on the allow list, or ValueError. Only the last two words may be paths."""
    for a in argv[1:-2]:
        if a in FORBIDDEN or any(a.startswith(f + "=") for f in FORBIDDEN if f.startswith("--")) or \
                a.startswith("--delete"):
            raise ValueError(f"rsync option not allowed: {a}")
        if a not in ALLOWED and not a.startswith(ALLOWED_PREFIX):
            raise ValueError(f"rsync option not allowed: {a}")
    return argv


def rsync_argv(kind: str, list_file: str, src: str, dest: str, *, hardlinks: bool = False,
               checksum: bool = False, stamp: str = "") -> list[str]:
    """kind: dry (what would happen), copy, check (what still differs)."""
    base = ["rsync", "-r", "-l", "-p", "-t", "--from0", f"--files-from={list_file}"]
    if hardlinks:
        base.append("-H")
    if kind == "dry":
        argv = base + ["-n", "--stats", "--itemize-changes", "--update"]
    elif kind == "copy":
        argv = base + ["--sparse", "--update", "--backup", f"--backup-dir={dest}/.hpc-hub-replaced/{stamp}",
                       "--partial", "--partial-dir=.hpc-hub-partial", "--info=progress2,stats2"]
        if checksum:
            argv.append("--checksum")
    elif kind == "check":  # --update: a newer file in project is yours, not a difference
        argv = base + ["-n", "-i", "--update"] + (["--checksum"] if checksum else [])
    else:
        raise ValueError(kind)
    return check_flags(argv + [f"{src}/", f"{dest}/"])


def _words(argv: list[str]) -> str:
    """argv for the job script: "$VAR" words stay shell variables, the rest is quoted."""
    out = []
    for a in argv:
        out.append(a if '"$' in a else shlex.quote(a))
    return " ".join(out)


def script(mode: str, scan_id: str, scratch: str, dest: str, home_dest: str, plan_hash: str, profile: ComputeProfile,
           *, cluster_id: str = "", hardlinks: bool = False, total_bytes: int = 0) -> str:
    """The batch script; mode: dry (the trial run) or copy (copy, then check)."""
    if mode not in ("dry", "copy"):
        raise ValueError(mode)
    checksum = total_bytes <= CHECKSUM_UP_TO
    minutes = DRY_MINUTES if mode == "dry" else COPY_MINUTES
    head = ["#!/bin/bash -l", f"#SBATCH --job-name={JOB_PREFIX}{mode}-{scan_id}", f"#SBATCH --output={mode}.out"]
    if mode == "copy":
        head.append("#SBATCH --signal=B:USR1@300")  # five minutes before the time limit: go on in a new job
    head += [f"#SBATCH {a}" for a in slurm.resource_args(job_profile(profile, cluster_id, minutes))]
    lines = head + [
        "",
        "set -u",
        f"DIR={folder(scan_id)}",
        f"S={shlex.quote(scratch.rstrip('/'))}",
        f"DEST={shlex.quote(dest.rstrip('/'))}",
        f"HOME_DEST={shlex.quote(home_dest.rstrip('/'))}",
        f"HASH={shlex.quote(plan_hash)}",
        'cd "$DIR" || exit 1',
        'state() { echo "$1" > copy.state.tmp && mv -f copy.state.tmp copy.state; }',
        'fail() { printf %s "$1" > copy.why; state failed; exit 1; }',
        'js() { python3 -I -c \'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))\' '
        '"$1" "$2"; }',
        # the destination: a from-scratch folder, never inside scratch
        f'case "$DEST" in */{FROM_SCRATCH}) ;; *) fail "Copies only go to a from-scratch folder."; esac',
        f'[ -z "$HOME_DEST" ] || case "$HOME_DEST" in */{FROM_SCRATCH}) ;; *) fail "Copies only go to a '
        f'from-scratch folder."; esac',
        'RS=$(readlink -f "$S")',
        'for d in "$DEST" $HOME_DEST; do mkdir -p "$d" || fail "Can not make $d."',
        '  case "$(readlink -f "$d")/" in "$RS"/*) fail "The copy can not go inside scratch.";; esac; done',
        *(['[ -f dry.json ] && [ "$(js dry.json hash)" = "$HASH" ] || fail "Try it first."'] if mode == "copy"
          else []),
        "state filtering",
        'python3 -I listfilter.py "$S" "$DIR" "$(date +%s)" || fail "Could not make the file list."',
        '[ "$(js filter.json hash)" = "$HASH" ] || fail "The plan changed. Try it first again."',
        'NEED=$(js filter.json bytes)',
        'free_bytes() { df -Pk "$1" | awk \'NR == 2 {print $4 * 1024}\'; }',
        'FREE=$(free_bytes "$DEST")',
        f'[ -n "$FREE" ] && [ "$NEED" -gt "$(awk -v f="$FREE" \'BEGIN {{printf "%d", f * {SPACE_MARGIN}}}\')" ] && '
        'fail "Not enough space. The copy needs $((NEED / 1073741824)) GB and the destination has '
        '$((FREE / 1073741824)) GB free."',
        "rsync --help 2>&1 | grep -q -- --open-noatime && NOATIME=--open-noatime || NOATIME=",
    ]
    lists = [("copy.list0", '"$DEST"'), ("copy-home.list0", '"$HOME_DEST"')]
    if mode == "dry":
        lines.append("state trying")
        lines.append(": > dry.out")
        for lst, d in lists:
            argv = rsync_argv("dry", lst, '"$S"', d, hardlinks=hardlinks)
            lines.append(f'[ -s {lst} ] && [ -n {d} ] && {{ {_words(argv[:-2])} $NOATIME {_words(argv[-2:])} '
                         '>> dry.out 2>> dry.err || fail "The trial run did not finish."; }')
        lines += [
            'python3 -I -c \'import json, sys, re\n'
            'out = open("dry.out", errors="replace").read()\n'
            'new = sum(1 for l in out.splitlines() if l.startswith(">f+"))\n'
            'changed = sum(1 for l in out.splitlines() if l.startswith(">f") and not l.startswith(">f+"))\n'
            'f = json.load(open("filter.json"))\n'
            'json.dump({"hash": sys.argv[1], "files": f["files"], "bytes": f["bytes"], "new": new, '
            '"will_replace": changed, "busy": f["busy"], "busy_count": f["busy_count"]}, open("dry.json", "w"))\' '
            '"$HASH"',
            "state tried",
            "",
        ]
        return "\n".join(lines)
    stamp = '"$(date +%F-%H%M%S)"'
    lines += [
        'N=${HPCHUB_RESUBMIT:-0}',
        'PID=""',
        f'resubmit() {{ [ -n "$PID" ] && kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; '
        f'if [ "$N" -lt {RESUBMITS} ]; then sbatch --parsable --export=ALL,HPCHUB_RESUBMIT=$((N + 1)) copy.sbatch '
        f'> copy.job_id && echo $((N + 1)) > resubmits && state resubmitted; '
        f'else fail "The copy needs more time than {RESUBMITS} jobs. Start it again later."; fi; exit 0; }}',
        "trap resubmit USR1",
        "trap '[ -n \"$PID\" ] && kill \"$PID\" 2>/dev/null; state cancelled; exit 1' TERM",
        f"STAMP={stamp}",
        "state copying",
        ": > copy.err",
    ]
    for lst, d in lists:
        argv = rsync_argv("copy", lst, '"$S"', d, hardlinks=hardlinks, stamp="$STAMP")
        argv = [a.replace("$STAMP", '"$STAMP"') if a.startswith("--backup-dir=") else a for a in argv]
        lines += [
            f'if [ -s {lst} ] && [ -n {d} ]; then',
            f'  {_words(argv[:-2])} $NOATIME {_words(argv[-2:])} > copy.progress 2>> copy.err & PID=$!',
            '  wait "$PID"; RC=$?; PID=""',
            '  case $RC in 0|23|24) ;; *) fail "The copy stopped. rsync said: $(tail -n 3 copy.err)";; esac',
            "fi",
        ]
    lines += ["state verifying", ": > mismatch.list0"]
    for lst, d in lists:
        check = rsync_argv("check", lst, '"$S"', d, hardlinks=hardlinks, checksum=checksum)
        lines.append(f'[ -s {lst} ] && [ -n {d} ] && {_words(check[:-2])} $NOATIME {_words(check[-2:])} 2>/dev/null '
                     f'| awk \'/^(>f|<f|cL|>L)/ {{sub(/^[^ ]+ /, ""); printf "%s\\0", $0}}\' '
                     f'>> mismatch.list0')
    again = rsync_argv("copy", "mismatch.list0", '"$S"', '"$DEST"', hardlinks=hardlinks, checksum=True,
                       stamp="$STAMP")
    again = [a.replace("$STAMP", '"$STAMP"') if a.startswith("--backup-dir=") else a for a in again]
    recheck = rsync_argv("check", "mismatch.list0", '"$S"', '"$DEST"', hardlinks=hardlinks, checksum=True)
    lines += [
        "if [ -s mismatch.list0 ]; then",
        f'  {_words(again[:-2])} $NOATIME {_words(again[-2:])} > /dev/null 2>> copy.err',
        f'  {_words(recheck[:-2])} $NOATIME {_words(recheck[-2:])} 2>/dev/null | '
        "awk '/^(>f|<f|cL|>L)/ {n++} END {print n + 0}' > mismatches",
        "else echo 0 > mismatches; fi",
        f'VERIFIED={"checksum" if checksum else "quick"}',
        'python3 -I -c \'import json, re, sys\n'
        'f = json.load(open("filter.json"))\n'
        'err = open("copy.err", errors="replace").read().splitlines()\n'
        'failed = [{"path": m.group(1), "why": m.group(2)} for m in (re.search(r"\\"(.+?)\\".*?: (.+)$", l) '
        'for l in err if "failed" in l) if m][:500]\n'
        'res = {"copied_files": f["files"] - len(failed), "bytes": f["bytes"], "verified": sys.argv[1], '
        '"mismatches": int(open("mismatches").read().strip() or 0), "busy": f["busy"], "failed": failed, '
        '"notes_path": sys.argv[2] + "/BACKUP-NOTES.md"}\n'
        'json.dump(res, open("result.json", "w"))\' "$VERIFIED" "$DEST"',
        "{",
        '  echo "## $(date "+%F %H:%M") from $S"',
        '  echo',
        '  echo "Copied $(js result.json copied_files) files, $(( $(js filter.json bytes) / 1048576 )) MB, from '
        'scratch by HPC Hub. Checked: $VERIFIED. Nothing in scratch was changed or deleted."',
        "  python3 -I -c 'import json\n"
        "for r in json.load(open(\"rules.json\"))[\"rules\"]:\n"
        "    if not r[\"keep\"]:\n"
        "        print(\"- Left out:\", r[\"folder\"], r.get(\"class\") or r.get(\"glob\"))'",
        "  echo",
        '} >> "$DEST/BACKUP-NOTES.md"',
        "state done",
        "",
    ]
    return "\n".join(lines)


def start_command(scan_id: str, mode: str, job: str, rules: str = "") -> str:
    """Write the job (and for the trial run the rules and the filter) into the scan's folder, then submit it."""
    d = folder(scan_id)
    steps = [f"cd {d}"]
    if mode == "dry":
        steps += [f"printf %s {shlex.quote(_b64(rules))} | base64 -d > rules.json",
                  f"printf %s {shlex.quote(_b64(remote_source('listfilter')))} | base64 -d > listfilter.py",
                  "rm -f dry.json"]
    steps += [f"printf %s {shlex.quote(_b64(job))} | base64 -d > {mode}.sbatch",
              "rm -f result.json copy.why resubmits", f"echo {'trying' if mode == 'dry' else 'copying'} > copy.state",
              f"sbatch --parsable {mode}.sbatch | tee {'dry' if mode == 'dry' else 'copy'}.job_id"]
    return " && ".join(steps)


def cancel_command(scan_id: str) -> str:
    d = folder(scan_id)
    return (f'for j in {d}/copy.job_id {d}/dry.job_id; do [ -f "$j" ] && scancel "$(cat "$j")" 2>/dev/null; done; '
            f'echo cancelled > {d}/copy.state')


def progress_command(scan_id: str) -> str:
    d = folder(scan_id)
    return (f"cd {d} 2>/dev/null || exit 0; cat copy.state 2>/dev/null; printf '\\037'; "
            "tail -c 4000 copy.progress 2>/dev/null; printf '\\037'; cat filter.json 2>/dev/null; printf '\\037'; "
            "cat resubmits 2>/dev/null; printf '\\037'; cat copy.why 2>/dev/null; true")


PROGRESS = re.compile(r"([\d,]+)\s+(\d+)%\s+\S+\s+(\d+):(\d\d):(\d\d)(?:\s+\(xfr#(\d+), (?:ir|to)-chk=(\d+)/(\d+)\))?")


def parse_progress(text: str) -> Progress:
    parts = (text.split("\x1f") + ["", "", "", "", ""])[:5]
    state = parts[0].strip() or "copying"
    p = Progress(state=state if state in STATES else "failed")
    try:
        f = json.loads(parts[2]) if parts[2].strip() else {}
    except ValueError:
        f = {}
    p.total_bytes, p.files_total = f.get("bytes", 0), f.get("files", 0)
    last = [m for m in PROGRESS.finditer(parts[1].replace("\r", "\n"))]
    if last:
        m = last[-1]
        p.done_bytes = int(m.group(1).replace(",", ""))
        p.eta_s = int(m.group(3)) * 3600 + int(m.group(4)) * 60 + int(m.group(5))
        if m.group(7) and m.group(8):
            p.files_done = int(m.group(8)) - int(m.group(7))
    if p.state == "done":
        p.done_bytes, p.files_done = p.total_bytes, p.files_total
    p.resubmits = int(parts[3].strip()) if parts[3].strip().isdigit() else 0
    p.detail = parts[4].strip() if p.state == "failed" else detail(p)
    return p


def detail(p: Progress) -> str:
    gb = 1024 ** 3
    if p.state in ("filtering", "trying"):
        return "Making the list of files"
    if p.state == "tried":
        return "Ready"
    if p.state == "copying":
        left = f", about {duration_text(max(p.eta_s, 60))} left" if p.eta_s else ""
        return f"{p.done_bytes / gb:.1f} GB done{left}"
    if p.state == "verifying":
        return "Checking every file against the one in scratch"
    if p.state == "resubmitted":
        return "The copy needed more time, so it goes on in a new job"
    if p.state == "done":
        return "Done"
    if p.state == "cancelled":
        return "Stopped. Files copied so far stay in project."
    return ""


def parse_result(text: str) -> Result:
    try:
        d = json.loads(text)
    except ValueError:
        return Result()
    return Result(**{k: v for k, v in d.items() if k in Result.__dataclass_fields__})

