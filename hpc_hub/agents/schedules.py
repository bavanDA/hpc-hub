"""Scheduled agents: an agent runs a task on its own, e.g. every night at 02:00, with your laptop off.

Wulver has scrontab turned off, so each schedule is a batch job that waits (sbatch --begin) and, when it
starts, first queues its next run. Everything lives on the cluster in ~/.hpc-hub/schedules/<name>/:
schedule.json (what the app shows), task.md, run.sbatch, enabled (a flag file) and logs/.
"""

import json
import re
import shlex
from dataclasses import asdict, dataclass, field, fields, replace

from ..compute import limits, slurm
from ..core.config import AgentSettings, ComputeProfile
from ..core.ssh import SshMaster
from .ask_all import headless, shell_path
from .catalog import BY_ID, Agent

ROOT = ".hpc-hub/schedules"  # under $HOME
JOB_PREFIX = "hpc-hub-sched-"
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

BRANCH_RULES = ("Work on a new git branch named agent/{role}-<today's date> (if the folder is a git repository), "
                "make small commits with short messages, and do not push. If tests exist, run them before you "
                "commit. Finish with a short summary of what you changed and why.")
PRESETS = {
    "Clean the code": (
        "cleanup",
        "Clean up the code in this folder without changing what it does: remove dead code and duplication, "
        "split files that are too long into small modules that each do one thing, and simplify where it "
        "clearly helps. Follow CODING_STANDARDS.md or similar docs if the repository has them. "
        + BRANCH_RULES.format(role="cleanup")),
    "Find bugs and write tests": (
        "bugs",
        "Look for bugs in this folder. Read the code, run the tests, and add tests for important logic that "
        "has none. For every real bug you find, first write a test that fails because of it, then fix it. "
        + BRANCH_RULES.format(role="bugs")),
    "Make my jobs faster": (
        "jobs",
        "Make my Slurm jobs faster and cheaper. Look at my jobs from the last 7 days with "
        "sacct -u $USER -S now-7days -X -o JobID,JobName,Partition,QOS,AllocCPUS,ReqMem,MaxRSS,Elapsed,"
        "TotalCPU,Timelimit,State and at the job scripts in this folder. Find waste (low CPU use, much more "
        "memory or time than needed, work that could be a job array or run in parallel, slow I/O) and change "
        "the scripts to fix it. " + BRANCH_RULES.format(role="jobs")),
    "Custom task": ("task", ""),
}


@dataclass
class Schedule:
    name: str  # folder and job name: letters, digits, - and _
    agent: str = "claude"
    folder: str = "~"
    task: str = ""
    time: str = "02:00"  # HH:MM, cluster time
    days: list[int] = field(default_factory=list)  # 1 = Monday ... 7 = Sunday; empty = every day
    minutes: int = 120  # time limit of each run
    enabled: bool = True

    @property
    def job_name(self) -> str:
        return JOB_PREFIX + self.name

    @property
    def when(self) -> str:
        if not self.days or len(self.days) == 7:
            return f"Every day at {self.time}"
        if sorted(self.days) == [1, 2, 3, 4, 5]:
            return f"Weekdays at {self.time}"
        return f"{', '.join(DAY_NAMES[d - 1] for d in sorted(self.days))} at {self.time}"


@dataclass
class Status:
    schedule: Schedule
    job_id: str = ""  # the queued or running job
    state: str = ""  # PENDING (waiting for its time) or RUNNING
    start: str = ""  # when the queued job will start
    last_log: str = ""  # newest answer file in logs/
    last_run: int = 0


def slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", name.strip()).strip("-")[:40] or "agent"


def folder_of(name: str) -> str:
    return f'"$HOME"/{ROOT}/{shlex.quote(name)}'


NEXT_RUN = r"""next_run() {  # first matching day and time still ahead, as YYYY-MM-DDTHH:MM:00
  local now i d
  now=$(date +%s)
  for i in 0 1 2 3 4 5 6 7; do
    d=$(date -d "+$i day" +%F)
    case " $DAYS " in *" $(date -d "$d" +%u) "*) ;; *) continue ;; esac
    [ "$(date -d "$d $TIME" +%s)" -gt "$now" ] && { echo "${d}T${TIME}:00"; return; }
  done
}"""


def script(s: Schedule, agent: Agent, settings: AgentSettings, profile: ComputeProfile) -> str:
    """The batch script: queue the next run, then run the agent on the task once."""
    days = " ".join(str(d) for d in (s.days or range(1, 8)))
    body = "\n".join([
        f"DIR={folder_of(s.name)}",
        f"DAYS={shlex.quote(days)}",
        f"TIME={shlex.quote(s.time)}",
        NEXT_RUN,
        'if [ -z "${HPCHUB_ONCE:-}" ] && [ -f "$DIR/enabled" ]; then',
        '  sbatch --quiet --begin="$(next_run)" "$DIR/run.sbatch"',
        "fi",
        'OUT="$DIR/logs"',
        'mkdir -p "$OUT"',
        f"cd {shell_path(s.folder)} || exit 1",
        f'{headless(agent, settings, chr(34) + "$DIR/task.md" + chr(34))} > "$OUT/$(date +%F-%H%M).md" 2>&1',
    ])
    lines = ["#!/bin/bash -l", f"#SBATCH --job-name={s.job_name}", '#SBATCH --output=logs/slurm-%j.out']
    lines += [f"#SBATCH {a}" for a in slurm.resource_args(replace(profile, time=limits.slurm_time(s.minutes)))]
    return "\n".join(lines + ["", body, ""])


def save_command(s: Schedule, settings: AgentSettings, profile: ComputeProfile) -> str:
    """Write the schedule's files, then (re)queue it: cancel the waiting job, submit for the next time."""
    agent = BY_ID[s.agent]
    d = folder_of(s.name)
    meta = json.dumps(asdict(s))
    steps = [
        f"mkdir -p {d}/logs",
        f"printf %s {shlex.quote(meta)} > {d}/schedule.json",
        f"printf %s {shlex.quote(s.task)} > {d}/task.md",
        f"printf %s {shlex.quote(script(s, agent, settings, profile))} > {d}/run.sbatch",
        f"scancel --quiet --state=PENDING --name={shlex.quote(s.job_name)} 2>/dev/null; true",
    ]
    if s.enabled:
        days = " ".join(str(x) for x in (s.days or range(1, 8)))
        steps += [f"touch {d}/enabled",
                  f"cd {d} && DAYS={shlex.quote(days)} TIME={shlex.quote(s.time)} && {NEXT_RUN} && "
                  f'sbatch --parsable --begin="$(next_run)" run.sbatch']
    else:
        steps.append(f"rm -f {d}/enabled")
    return " && ".join(steps[:4]) + "; " + "; ".join(steps[4:])


def run_now_command(name: str) -> str:
    """One extra run right now that does not queue another."""
    return f"cd {folder_of(name)} && sbatch --parsable --export=ALL,HPCHUB_ONCE=1 run.sbatch"


def delete_command(s: Schedule) -> str:
    return f"scancel --quiet --name={shlex.quote(s.job_name)} 2>/dev/null; rm -rf {folder_of(s.name)}"


LIST = (f'for d in "$HOME"/{ROOT}/*/; do [ -f "$d/schedule.json" ] || continue; '
        'echo "@@SCHED"; cat "$d/schedule.json"; echo; '
        'f=$(ls -t "$d"logs/*.md 2>/dev/null | head -1); [ -n "$f" ] && echo "@@LAST $(stat -c %Y "$f") $f"; '
        "done; echo @@JOBS; "
        f'squeue -h -u "$USER" -o "%j|%i|%T|%S" 2>/dev/null | grep "^{JOB_PREFIX}"; true')


def parse_list(text: str) -> list[Status]:
    names = {f.name for f in fields(Schedule)}
    out: list[Status] = []
    jobs: dict[str, tuple[str, str, str]] = {}
    lines = iter(text.splitlines())
    in_jobs = False
    for line in lines:
        if line == "@@SCHED":
            try:
                raw = json.loads(next(lines, ""))
            except ValueError:
                continue
            if isinstance(raw.get("hours"), int):  # saved before minutes
                raw.setdefault("minutes", raw["hours"] * 60)
            sched = Schedule(**{k: v for k, v in raw.items() if k in names})
            sched.name = slug(str(sched.name))  # names go into job names and paths: only safe characters
            out.append(Status(sched))
        elif line.startswith("@@LAST ") and out:
            _, stamp, path = line.split(" ", 2)
            out[-1].last_run, out[-1].last_log = int(stamp) if stamp.isdigit() else 0, path
        elif line == "@@JOBS":
            in_jobs = True
        elif in_jobs and line.count("|") == 3:
            name, job_id, state, start = line.split("|")
            if state == "RUNNING" or name not in jobs:
                jobs[name] = (job_id, state, start)
    for st in out:
        st.job_id, st.state, st.start = jobs.get(st.schedule.job_name, ("", "", ""))
    return out


def list_schedules(ssh: SshMaster) -> list[Status]:
    return parse_list(ssh.run(LIST, timeout=30).stdout)
