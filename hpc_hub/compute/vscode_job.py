"""How far the VS Code job got, read from Slurm and its log in one call: in the queue, starting, waiting for the
GitHub sign-in (with the code to type), tunnel ready, the VS Code server installing on the node, or ended (and why).

status_command(job) is the shell line to run on the cluster; status(job, its output) reads it."""

import re

from ..terminals import links
from .job_log import log_path
from .sbatch import BATCH_DIR

JOB_NAME = "hpc-hub-vscode"
LOG_BYTES = 30_000  # the end of the log is enough: the links and the latest lines
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
# Lines that mean the command did not start (a wrong path, a missing module), worth showing while it still runs
# Queue reasons that never clear by themselves: the job would wait forever. Limits on all your jobs together
# (PerUser, Grp...) do clear when your other jobs end, so they are not here.
NEVER = re.compile(r"not permitted|not allowed|NotAllowed|Invalid(QOS|Qos|Account)|PerJob|PartitionTimeLimit|"
                   r"PartitionNodeLimit|PartitionConfig|BadConstraints|DependencyNeverSatisfied")
TROUBLE = re.compile(r"command not found|No such file or directory|Permission denied|^\s*error\b|\berror:|"
                     r"Traceback|panicked|Unable to|Could not", re.I)
WHY_ENDED = {
    "TIMEOUT": "Its time ran out",
    "CANCELLED": "It was cancelled",
    "FAILED": "It failed",
    "OUT_OF_MEMORY": "It ran out of memory",
    "NODE_FAIL": "Its node failed",
    "PREEMPTED": "Another job took its node",
    "COMPLETED": "It stopped",
}


def status_command(job_id: str) -> str:
    j = int(job_id)
    fallback = f"$HOME/{BATCH_DIR}/{JOB_NAME}-{j}.out"
    return (f"q=$(squeue -h -j {j} -o '%T|%N|%r|%S' 2>/dev/null | head -1); echo \"@@state $q\"; "
            f"d=; [ -z \"$q\" ] && d=$(sacct -n -X -P -j {j} -o State,ExitCode 2>/dev/null | head -1); "
            f"echo \"@@done $d\"; f=$({log_path(job_id)}); [ -n \"$f\" ] || f=\"{fallback}\"; "
            f"echo @@log; [ -f \"$f\" ] && tail -c {LOG_BYTES} \"$f\"; true")


def _field(out: str, tag: str) -> str:
    m = re.search(rf"^@@{tag} ?(.*)$", out, re.M)
    return m.group(1).strip() if m else ""


def status(job_id: str, out: str) -> dict:
    queue = _field(out, "state").split("|")
    done = _field(out, "done").split("|")
    log = ANSI.sub("", out.split("@@log\n", 1)[1] if "@@log\n" in out else "")
    lines = [x.rstrip() for x in log.splitlines() if x.strip() and x.strip() != "*"]
    state, node, reason, start = (queue + ["", "", "", ""])[:4]
    found = links.find_links(log)
    tunnel = next((x for x in reversed(found) if x.kind == links.TUNNEL), None)
    device = next((x for x in reversed(found) if x.kind == links.DEVICE_LOGIN), None)
    downloading = log.rfind("Downloading Visual Studio Code server")
    started = log.rfind("Server started")
    trouble = [x for x in lines if TROUBLE.search(x) and "*** JOB" not in x]  # Slurm's own end line: said already
    got = {
        "job": job_id, "state": state or done[0].split(" ")[0],
        "node": node if node and not node.startswith("(") else "",
        "reason": "" if reason in ("", "None") else reason,
        "start": "" if start in ("", "N/A", "Unknown") else start,
        "tunnel": links.tunnel_name(tunnel.url) if tunnel else "", "url": tunnel.url if tunnel else "",
        "home": "/" + "/".join(tunnel.url.split("/")[5:]) if tunnel else "",
        "device": {"url": device.url, "code": device.code} if device and not tunnel else None,
        "installing": downloading > started, "server": started >= 0,
        "web": next((x.url for x in found if x.kind == links.LOCAL_WEB), ""),
        "problem": "", "tail": lines[-12:], "stuck": False,
    }
    if not state:
        got["phase"] = "ended"
        why = WHY_ENDED.get(got["state"].split(" ")[0], "It is no longer running")
        got["problem"] = f"The VS Code job ended. {why}." + (f" {trouble[-1].strip()}" if trouble else "")
    elif state in ("PENDING", "REQUEUED", "SUSPENDED"):
        got["phase"] = "queued"
        if NEVER.search(reason):
            got["stuck"] = True
            got["problem"] = f"This job can't start with this queue and priority. Slurm says: {reason}."
    elif tunnel:
        got["phase"] = "ready"
    elif device:
        got["phase"] = "login"
    else:
        got["phase"] = "starting"
        if trouble:
            got["problem"] = trouble[-1].strip()
    return got
