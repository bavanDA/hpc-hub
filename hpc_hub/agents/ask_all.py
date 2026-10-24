"""Ask all: one prompt to several agents at once, each writes its answer to a shared folder.

With "discuss" on there is a second round: every agent reads the others' answers and writes a reply.
Everything runs from one bash script in one tmux session on the compute node, so it survives the app.
"""

import base64
import shlex
from dataclasses import dataclass, replace

from ..core.config import AgentSettings
from .catalog import AGY, CLAUDE, CODEX, CURSOR, Agent


@dataclass
class Ask:
    folder: str  # where the agents work
    out: str  # where the answers go
    prompt: str
    agents: list[tuple[Agent, AgentSettings]]
    discuss: bool = False


def shell_path(path: str) -> str:
    """~ and ~/x for the shell, everything else quoted."""
    path = path.strip() or "~"
    if path == "~":
        return '"$HOME"'
    if path.startswith("~/"):
        return f'"$HOME"/{shlex.quote(path[2:])}'
    return shlex.quote(path)


def headless(agent: Agent, s: AgentSettings, prompt_file: str) -> str:
    """Command that runs one prompt non-interactively and prints the answer. prompt_file is a shell word."""
    base = s.command.strip() or agent.id
    prompt = f'"$(cat {prompt_file})"'
    if agent is CODEX:
        args = ["--no-daemon", "exec", "--skip-git-repo-check", "--add-dir", '"$OUT"']
        args += ["-s", "workspace-write"]
        if s.effort:
            args += ["-c", shlex.quote(f"model_reasoning_effort={s.effort}")]
        return " ".join([base, *args, prompt])
    # nobody is there to answer prompts: let it edit files (commands follow the cluster's allow list)
    mode = {CLAUDE: "acceptEdits", AGY: "accept-edits"}
    s = replace(s, mode=s.mode or mode.get(agent, ""))
    opts = [a for o in agent.options for a in o.args(getattr(s, o.key))]
    if agent is AGY:  # agy's -p takes the prompt as its value, so it goes last
        return " ".join([base, "--add-dir", '"$OUT"', *opts, "-p", prompt])
    if agent is CLAUDE:
        args = ["-p", "--add-dir", '"$OUT"']
    elif agent is CURSOR:
        args = ["-p", "--trust", "--add-dir", '"$OUT"']
    else:
        args = ["-p"]
    return " ".join([base, *args, *opts, prompt])


def round1_prompt(ask: Ask, agent: Agent) -> str:
    names = ", ".join(a.name for a, _ in ask.agents)
    return (f"{ask.prompt.strip()}\n\n---\n"
            f"You are {agent.name}, one of several AI agents ({names}) answering this same request in parallel. "
            f"Work in {ask.folder}. When you are done, write your complete answer as Markdown to "
            f"{ask.out}/{agent.id}.md. Do not change the other files in {ask.out}.\n")


def round2_prompt(ask: Ask, agent: Agent) -> str:
    names = ", ".join(a.name for a, _ in ask.agents)
    files = ", ".join(f"{a.id}.md ({a.name})" for a, _ in ask.agents)
    return (f"Round 2. These agents answered the request below: {names}.\n"
            f"Their answers are in {ask.out}: {files}. Yours is {agent.id}.md.\n"
            "Read all of them. Say where you agree, where you disagree and why, and what the others missed. "
            "Then give your improved final answer.\n"
            f"Write it as Markdown to {ask.out}/{agent.id}.round2.md. Do not change the other files.\n\n"
            f"The request was:\n\n{ask.prompt.strip()}\n")


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def script(ask: Ask) -> str:
    """The bash script that runs both rounds and keeps answers in ask.out."""
    lines = ["set -u", f"OUT={shell_path(ask.out)}", 'mkdir -p "$OUT"', f"cd {shell_path(ask.folder)} || exit 1",
             f"printf %s {_b64(ask.prompt)} | base64 -d > \"$OUT/prompt.md\"",
             "run() {  # run <name> <command>: output goes to <name>.log, and to <name>.md if the agent wrote none",
             '  echo "$(date +%H:%M:%S)  $1 started"',
             '  bash -c "$2" > "$OUT/$1.log" 2>&1 </dev/null',
             '  rc=$?',
             '  [ -s "$OUT/$1.md" ] || cp "$OUT/$1.log" "$OUT/$1.md"',
             '  echo "$(date +%H:%M:%S)  $1 finished (exit $rc)"',
             "}",
             "export OUT"]
    rounds = [("", round1_prompt)] + ([(".round2", round2_prompt)] if ask.discuss else [])
    for n, (suffix, make) in enumerate(rounds, 1):
        lines.append(f'echo "Round {n}: {", ".join(a.name for a, _ in ask.agents)}"')
        for agent, s in ask.agents:
            pfile = f'"$OUT/.prompt.{agent.id}{suffix}"'
            lines.append(f"printf %s {_b64(make(ask, agent))} | base64 -d > {pfile}")
            lines.append(f"run {agent.id}{suffix} {shlex.quote(headless(agent, s, pfile))} &")
        lines.append("wait")
    lines += ['echo', 'echo "All done. Answers are in $OUT:"', 'ls -1 "$OUT"/*.md']
    return "\n".join(lines) + "\n"


def command(ask: Ask) -> str:
    """One shell line that writes the script next to the answers and runs it."""
    return (f"mkdir -p {shell_path(ask.out)} && printf %s {_b64(script(ask))} | base64 -d > "
            f"{shell_path(ask.out)}/run.sh && bash {shell_path(ask.out)}/run.sh")
