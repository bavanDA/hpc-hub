"""Remote shell helpers: bashrc aliases, command lookup, run-on-node command lines."""

import re
import shlex

from .ssh import SshMaster

ALIAS_RE = re.compile(r"^alias ([\w.:+-]+)='(.*)'$")
FUNC_RE = re.compile(r"^declare -f ([\w.:+-]+)$")


def parse_aliases(text: str) -> dict[str, str]:
    """Output of `alias; declare -F` -> {name: definition}."""
    found = {}
    for line in text.splitlines():
        line = line.strip()
        if m := ALIAS_RE.match(line):
            found[m.group(1)] = m.group(2).replace("'\\''", "'")
        elif m := FUNC_RE.match(line):
            found.setdefault(m.group(1), "(function)")
    return found


def vscode_candidates(aliases: dict[str, str]) -> list[str]:
    """Aliases/functions that look like they start VS Code, best first."""
    def score(item):
        name, body = item[0].lower(), item[1].lower()
        return ("code" in name) * 2 + any(k in body for k in ("code", "tunnel", "serve-web"))
    hits = [kv for kv in aliases.items() if score(kv) > 0 and not kv[0].startswith("_")]
    return [name for name, _ in sorted(hits, key=score, reverse=True)]


def command_type(ssh: SshMaster, name: str) -> str:
    """alias / function / file / '' as seen by an interactive shell (so ~/.bashrc counts)."""
    res = ssh.run(f"bash -ic {shlex.quote('type -t ' + shlex.quote(name))} 2>/dev/null </dev/null", timeout=45)
    return res.stdout.strip().splitlines()[-1] if res.stdout.strip() else ""


def cd_part(workdir: str) -> str:
    workdir = workdir.strip() or "~"
    if workdir == "~":
        return 'cd "$HOME"'
    if workdir.startswith("~/"):
        return f'cd "$HOME"/{shlex.quote(workdir[2:])}'
    return f"cd {shlex.quote(workdir)}"


def on_node(job_id: str, workdir: str, command: str) -> str:
    """Interactive shell on the job's node (bash -i so ~/.bashrc aliases work)."""
    inner = f"{cd_part(workdir)} && {command}; exec bash -i"
    return f"srun --jobid={int(job_id)} --overlap --pty bash -ic {shlex.quote(inner)}"
