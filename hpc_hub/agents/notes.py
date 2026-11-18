"""What HPC Hub tells every agent about the cluster, in each agent's own instructions file in your home folder:
Claude's ~/.claude/CLAUDE.md, Codex's ~/.codex/AGENTS.md and Antigravity's ~/.gemini/GEMINI.md.

The note sits between two markers, so a newer HPC Hub replaces its own text and leaves the rest of the file alone.
A note you deleted stays deleted (~/.hpc-hub/agent-notes.json remembers where one was added)."""

import base64
import shlex

from ..compute import job_size
from ..core.ssh import SshMaster

BEGIN, END = "<!-- hpc-hub: job size -->", "<!-- /hpc-hub: job size -->"
FILES = ["~/.claude/CLAUDE.md", "~/.codex/AGENTS.md", "~/.gemini/GEMINI.md"]
ADDED = "~/.hpc-hub/agent-notes.json"

JOB_SIZE = """# Slurm job size
Before you submit a job with sbatch, run `hpchub-size` (in ~/.local/bin) with the same words you would give sbatch,
for example `hpchub-size run.sh --plan-only` or `hpchub-size --mem=64G run.sh`. It shows what earlier runs of that
job really used (peak memory, busy cores, time) and suggests --mem, --cpus-per-task and --time.
- Ask for about what the job needs, not the most the queue allows. Memory and cores you ask for are held while the
  job runs, and other people's jobs wait for them.
- A first run with no history: ask for a modest amount (for example 4 cores and 8G) and a short --time (for example
  30 minutes), then run `hpchub-size` again after it ends.
- When the program has its own dry run (for example `--plan-only`), its estimate counts: size the first real run
  from it.
- A job that takes whole nodes (all their cores, or --exclusive) blocks nobody by asking for extra memory. Size jobs
  that share a node with care.
"""

# Runs on the cluster's python3, which may be 3.6. argv: the note in base64, then the files.
WRITE = r"""import base64, json, os, sys
note = base64.b64decode(sys.argv[1]).decode()
begin, end = sys.argv[2], sys.argv[3]
added_at = os.path.expanduser(sys.argv[4])
try:
    added = json.load(open(added_at))
except (OSError, ValueError):
    added = {}
for name in sys.argv[5:]:
    path = os.path.expanduser(name)
    if not os.path.isdir(os.path.dirname(path)):
        continue  # that agent was never used here
    try:
        old = open(path).read()
    except OSError:
        old = ""
    block = begin + "\n" + note + end
    a, b = old.find(begin), old.find(end)
    if a >= 0 and b > a:
        new = old[:a] + block + old[b + len(end):]
    elif added.get(name):
        continue  # you took it out: it stays out
    else:
        new = old + ("\n" if old and not old.endswith("\n") else "") + ("\n" if old else "") + block + "\n"
    if new != old:
        with open(path + ".hpchub", "w") as f:
            f.write(new)
        os.replace(path + ".hpchub", path)
    added[name] = True
os.makedirs(os.path.dirname(added_at), exist_ok=True)
json.dump(added, open(added_at, "w"))
"""


def write_command(note: str = JOB_SIZE) -> str:
    """Puts the note in each agent's instructions file (replacing an older one), for the agents used here."""
    data = base64.b64encode(note.encode()).decode()
    return "python3 -c " + " ".join(shlex.quote(x) for x in [WRITE, data, BEGIN, END, ADDED, *FILES])


def prepare(ssh: SshMaster) -> None:
    """Before an agent starts: hpchub-size on the cluster, and the note about it where the agent reads it."""
    try:
        ssh.run(f"{job_size.install_line()} && {write_command()}", timeout=60)
    except Exception:  # noqa: BLE001 - the agent starts without them
        pass
