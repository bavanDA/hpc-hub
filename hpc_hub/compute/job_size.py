"""Right-sizing Slurm jobs. hpchub-size (the files in sizing/) runs on the cluster: it measures every finished job
from sacct, keeps a small history there (~/.hpc-hub/job-sizes.json, so agents on the cluster and the app see the
same) and says what a job should ask for. The app asks it before you submit; agents run it themselves."""

import base64
import json
import shlex
from pathlib import Path

from ..core.ssh import SshMaster
from .sizing import size_advise, size_measure

SIZING = Path(__file__).parent / "sizing"
SOURCES = ("hpchub_size.py", "size_advise.py", "size_measure.py")
FOLDER = ".hpc-hub/size"
BIN = ".local/bin/hpchub-size"
LAUNCHER = f'#!/bin/sh\nexec python3 "$HOME/{FOLDER}/hpchub_size.py" "$@"\n'


def _put(path: str, text: str, mode: str = "") -> str:
    """Write the file only when it differs, so a second start changes nothing."""
    data = base64.b64encode(text.encode()).decode()
    f = f'"$HOME"/{path}'
    keep = f"chmod {mode} {f}.new && " if mode else ""
    return (f"echo {data} | base64 -d > {f}.new && "
            f"{{ cmp -s {f}.new {f} && rm -f {f}.new || {{ {keep}mv {f}.new {f}; }}; }}")


def install_line() -> str:
    """Puts hpchub-size (or a newer copy) on the cluster: its files in ~/.hpc-hub/size, the command in ~/.local/bin."""
    steps = [f'mkdir -p "$HOME/{FOLDER}" "$HOME/.local/bin"']
    steps += [_put(f"{FOLDER}/{name}", (SIZING / name).read_text()) for name in SOURCES]
    steps.append(_put(BIN, LAUNCHER, "+x"))
    return " && ".join(steps)


def _word(path: str) -> str:
    path = path.strip()
    return f'"$HOME"/{shlex.quote(path[2:])}' if path.startswith("~/") else shlex.quote(path)


def check_command(path: str, text: str = "") -> str:
    """hpchub-size --json for the script at path, run from its folder as Submit does. text: the script as the
    editor has it (maybe not saved yet)."""
    extra = f" --text-b64 {base64.b64encode(text.encode()).decode()}" if text else ""
    return (f'{install_line()} && f={_word(path)} && cd "$(dirname -- "$f")" && '
            f'python3 "$HOME/{FOLDER}/hpchub_size.py" --json{extra} -- "$f"')


def check(ssh: SshMaster, path: str, text: str = "") -> dict:
    """What earlier runs of the job used and what to ask for; see size_advise.report."""
    if not path.strip():
        raise ValueError("Open a job script first")
    res = ssh.on_login(check_command(path, text), timeout=120)
    lines = res.stdout.strip().splitlines()
    try:
        return json.loads(lines[-1])
    except (ValueError, IndexError):
        raise ValueError(res.stderr.strip() or "Could not check the job size") from None


CORES = "@@HPCHUB_CORES@@"


def usage_command(job_id: str) -> str:
    """sacct for the job, then the cores of its nodes: a job with all of them blocked nobody with its memory."""
    j = shlex.quote(job_id)
    nodes = f'"$(sacct -n -X -P -j {j} -o NodeList 2>/dev/null | head -n 1)"'
    return (f"sacct -n -P -j {j} -o {size_measure.FIELDS}; echo {CORES}; "
            f"sinfo -h -N -n {nodes} -o '%N|%c' 2>/dev/null | head -n 50")


def usage_rows(text: str) -> list[dict]:
    """A finished job's "What it used" rows: memory used of what it asked for, cores busy, and a hint."""
    acct, _, cores = text.partition(CORES)
    runs = size_measure.parse_sacct(acct, submit=False, kinds=False)
    if not runs:
        return []
    size_measure.mark_whole(runs, lambda argv: (0, cores.strip()))
    r = runs[0]
    rows = []
    if r["peak_mb"]:
        asked = f" of {size_measure.gb(r['req_mb'])} asked for" if r.get("req_mb") else ""
        rows.append({"label": "Memory", "value": f"{size_measure.gb(r['peak_mb'])}{asked}"})
    if r.get("cpu_s") and r.get("elapsed"):
        rows.append({"label": "Cores", "value": f"{r['cpu_s'] / r['elapsed']:.1f} of {r['cpus']} busy on average"})
    s = size_advise.suggest([r])
    asked = {"mem_mb": r.get("req_mb"), "cpus": r.get("cpus"), "cores_fixable": True}
    said = size_advise.advice(asked, s, r["whole"], 1)
    tips = {x["kind"] for x in said if x["strict"] or x["kind"] in ("oom", "tight")}
    want = ([size_advise.gb_whole(s["mem_mb"])] if tips - {"cores"} else []) + (
        [f"{s['cpus']} cores"] if "cores" in tips else [])
    if want:
        rows.append({"label": "Next time", "value": "Ask for about " + " and ".join(want)})
    return rows
