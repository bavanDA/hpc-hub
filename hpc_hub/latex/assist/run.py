"""The agent as a job on a node: its folder, run.sh, and the lines that start and cancel it."""

import base64
import re
import shlex

from ...agents.catalog import AGY, CLAUDE, CODEX, CURSOR, Agent
from .choice import Choice, option
from .reply import MARK

TIMEOUT = 900  # seconds the agent may take
RUN_ROOT = ".hpc-hub/paper-agent"  # under $HOME: the prompt and run.sh while a job runs
ID_RE = re.compile(r"^[0-9a-f]{6,32}$")


def check_id(job_id: str) -> str:
    if not ID_RE.match(job_id or ""):
        raise ValueError("That job id looks wrong")
    return job_id


def run_dir(job_id: str) -> str:
    return f'"$HOME"/{RUN_ROOT}/{check_id(job_id)}'


def agent_line(agent: Agent, command: str, c: Choice, plain: bool = False) -> str:
    """The agent once on "$D/prompt.md", printing its answer. No tools: everything it needs is in the prompt.
    plain: only the flags every version knows (a cluster with an older agent)."""
    base = command.strip() or agent.id
    opts = [a for key in ("model", "effort") if (o := option(agent, key)) for a in o.args(getattr(c, key))]
    prompt = '"$(cat "$D/prompt.md")"'
    if agent is CLAUDE:
        if plain:
            return " ".join([base, "-p", *option(agent, "model").args(c.model), '< "$D/prompt.md"'])
        return " ".join([base, "-p", "--tools", "''", "--no-session-persistence", *opts, '< "$D/prompt.md"'])
    if agent is CODEX:
        return " ".join([base, "--no-daemon", "exec", "--skip-git-repo-check", "-s", "read-only", *opts, prompt])
    if agent is CURSOR:
        return " ".join([base, "-p", "--trust", "--mode", "ask", *opts, prompt])
    if agent is AGY:  # -p takes the prompt as its value, so it goes last
        return " ".join([base, *opts, "-p", prompt])
    return " ".join([base, "-p", prompt])


def run_script(job_id: str, agent: Agent, command: str, c: Choice, timeout: int = TIMEOUT) -> str:
    """run.sh: the agent in its own empty folder (no project files, nothing to load), its pid kept for Cancel,
    the answer printed after MARK, then the folder removed."""
    warm = ""
    if agent is CLAUDE:  # read the ~300 MB program in one go, not in small pieces (catalog.claude_start)
        exe = shlex.quote(shlex.split(command)[0]) if command.strip() else "claude"
        warm = f'{{ cat "$(readlink -f "$(type -P {exe})")" >/dev/null 2>&1 || true; }}'
    go = (f"go() {{ timeout {int(timeout)} bash -c \"$1\" > \"$D/out\" 2> \"$D/err\" & echo $! > \"$D/pid\"; "
          "wait $!; }")
    lines = [f"D={run_dir(job_id)}", "export D", 'cd "$D" || exit 1', go, warm,
             '[ -e "$D/cancelled" ] && { cd / && rm -rf "$D"; exit 130; }',
             f"go {shlex.quote(agent_line(agent, command, c))}", "rc=$?"]
    plain = agent_line(agent, command, c, plain=True)
    if plain != agent_line(agent, command, c):
        lines += ['if [ $rc -ne 0 ] && grep -qiE "unknown option|unexpected argument|unrecognized" "$D/err"; then',
                  f"  go {shlex.quote(plain)}; rc=$?", "fi"]
    lines += [f"echo {MARK}", 'cat "$D/out"', '[ $rc -eq 0 ] || tail -n 20 "$D/err" >&2', 'cd / && rm -rf "$D"',
              "exit $rc"]
    return "\n".join(x for x in lines if x) + "\n"


def prepare_script(job_id: str, run_sh: str) -> str:
    """For the login node, the prompt on stdin: the job's folder with prompt.md and run.sh."""
    b64 = base64.b64encode(run_sh.encode()).decode()
    return (f"D={run_dir(job_id)}; mkdir -p \"$D\" && cat > \"$D/prompt.md\" && "
            f"printf %s {b64} | base64 -d > \"$D/run.sh\"")


def start_line(job_id: str) -> str:
    """On the node: run.sh from a login shell, so the agent's PATH (set in ~/.bashrc) is there."""
    return f"bash -ic {shlex.quote(f'bash {run_dir(job_id)}/run.sh')} </dev/null"


def cancel_line(job_id: str) -> str:
    """On the node: stop the agent (timeout passes the signal on); run.sh then cleans up."""
    d = run_dir(job_id)
    return f'touch {d}/cancelled 2>/dev/null; p=$(cat {d}/pid 2>/dev/null) && kill -TERM "$p" 2>/dev/null; true'
