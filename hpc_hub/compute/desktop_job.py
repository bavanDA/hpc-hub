"""The Desktop: a Linux desktop (Xfce) on a compute node, as a Slurm job, shown on this computer by the app's viewer.

The job starts TurboVNC (as Open OnDemand's desktop does; TigerVNC's vncserver works too) in the foreground, so the
desktop ends with the job. It listens on the node with a password made for this desktop only, kept in
~/.hpc-hub/desktop/<job>/ where only you can read it (never in the job's log). It writes the display it got there
too; HPC Hub forwards that port over SSH and the viewer connects through vnc_bridge.

body(...) is the job's script; status_command(job) / status(job, out) read how far it got."""

import re

from .sbatch import BATCH_DIR

JOB_NAME = "hpc-hub-desktop"
DIR = f"{BATCH_DIR}/desktop"  # under $HOME: one folder per job
FIRST_PORT = 5900  # VNC: display N listens on 5900 + N

XSTARTUP = """#!/bin/sh
unset SESSION_MANAGER DBUS_SESSION_BUS_ADDRESS
for s in startxfce4 mate-session; do
  command -v "$s" >/dev/null 2>&1 && exec "$s"
done
xterm &
exec sleep infinity
"""


def body(width: int = 1600, height: int = 900) -> str:
    """The job: a one-time password, the desktop's start script, then TurboVNC in the foreground."""
    width, height = max(640, min(int(width), 7680)), max(480, min(int(height), 4320))
    return f"""set -u
umask 077
d="$HOME/{DIR}/$SLURM_JOB_ID"
mkdir -p "$d"
vnc=""
for c in /opt/TurboVNC/bin/vncserver "$(command -v vncserver 2>/dev/null)"; do
  [ -n "$c" ] && [ -x "$c" ] && {{ vnc=$c; break; }}
done
if [ -z "$vnc" ]; then
  echo "@@error This cluster's compute nodes have no VNC server (TurboVNC or TigerVNC)."
  exit 1
fi
pw=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 8)
printf '%s\\n' "$pw" > "$d/password"
printf '%s\\n' "$pw" | "$(dirname "$vnc")/vncpasswd" -f > "$d/passwd"
cat > "$d/xstartup" <<'XSTARTUP'
{XSTARTUP}XSTARTUP
chmod 700 "$d/xstartup"
echo "@@starting $vnc"
# its own display; the viewer speaks the plain VNC password, so only that; -fg: it ends with the job
"$vnc" -fg -geometry {width}x{height} -depth 24 -rfbauth "$d/passwd" -xstartup "$d/xstartup" \\
  -securitytypes VNC 2>&1 | while IFS= read -r line; do
    echo "$line"
    case $line in
      *"started on display"*) echo "${{line##*:}}" | tr -dc 0-9 > "$d/display"; echo "@@ready $(hostname -s)";;
    esac
  done
"""


def status_command(job_id: str) -> str:
    """Slurm's state and, once it has one, the display; never the password."""
    j = int(job_id)
    return (f"q=$(squeue -h -j {j} -o '%T|%N|%r' 2>/dev/null | head -1); echo \"@@state $q\"; "
            f"d=; [ -z \"$q\" ] && d=$(sacct -n -X -P -j {j} -o State 2>/dev/null | head -1); echo \"@@done $d\"; "
            f"echo \"@@display $(cat \"$HOME/{DIR}/{j}/display\" 2>/dev/null)\"; "
            f"echo \"@@error $(grep -h '^@@error' \"$HOME/{BATCH_DIR}/{JOB_NAME}-{j}.out\" 2>/dev/null | tail -1 | "
            "cut -c9-)\"; echo @@end")


def password_command(job_id: str) -> str:
    return f"cat \"$HOME/{DIR}/{int(job_id)}/password\""


def cleanup_command(job_id: str) -> str:
    return f"rm -rf -- \"$HOME/{DIR}/{int(job_id)}\""


def _field(out: str, tag: str) -> str:
    m = re.search(rf"^@@{tag} ?(.*)$", out, re.M)
    return m.group(1).strip() if m else ""


def status(job_id: str, out: str) -> dict:
    """{job, phase: queued|starting|ready|ended, node, port, reason, problem}. RuntimeError on a cut-off answer."""
    if not re.search(r"^@@end$", out, re.M):
        raise RuntimeError("Could not read the desktop's state from the cluster. Trying again.")
    state, node, reason = (_field(out, "state").split("|") + ["", "", ""])[:3]
    display, error = _field(out, "display"), _field(out, "error")
    got = {"job": job_id, "node": node if node and not node.startswith("(") else "",
           "reason": "" if reason in ("", "None") else reason, "port": 0, "problem": error}
    if not state:
        got["phase"] = "ended"
        got["problem"] = error or f"The desktop ended ({_field(out, 'done') or 'its job is gone'})."
    elif state in ("PENDING", "REQUEUED", "SUSPENDED", "CONFIGURING"):
        got["phase"] = "queued"
    elif display.isdigit():
        got["phase"], got["port"] = "ready", FIRST_PORT + int(display)
    else:
        got["phase"] = "starting"
    return got
