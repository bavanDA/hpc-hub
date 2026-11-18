"""Command lines for the cluster's shell: command lookup, cd, run on a node."""

import shlex
from dataclasses import dataclass

from .ssh import SshMaster


def command_type(ssh: SshMaster, name: str) -> str:
    """alias / function / file / '' as seen by an interactive shell (so ~/.bashrc counts)."""
    res = ssh.run(f"bash -ic {shlex.quote('type -t ' + shlex.quote(name))} 2>/dev/null </dev/null", timeout=45)
    return res.stdout.strip().splitlines()[-1] if res.stdout.strip() else ""


# What the agent's command is, and whether it can run: an npm install is a Node.js script, and with no Node.js
# (module not loaded, or removed) it stops at "/usr/bin/env: 'node': No such file or directory". The agents' own
# installers put a program that needs nothing into ~/.local/bin.
_LOOK = """t=$(type -t {n}); echo "@t=$t"
p=$(type -P {n}); [ -n "$p" ] && echo "@l=$(head -n1 "$p" 2>/dev/null | head -c 200)"
echo "@node=$(type -P node)"
f="$HOME/.local/bin/"{n}; [ -x "$f" ] && [ "$(head -c 2 "$f")" != '#!' ] && echo "@native=$f"
true"""


@dataclass(frozen=True)
class Command:
    kind: str  # alias / function / file / "" (not found), as an interactive shell sees it
    needs: str = ""  # what it needs to run that isn't there ("node"), so it would stop at once
    native: str = ""  # its own installer's copy in ~/.local/bin, which needs nothing: run that one instead


def parse_look(out: str) -> Command:
    got = dict(line[1:].split("=", 1) for line in out.splitlines() if line.startswith("@") and "=" in line)
    kind, first = got.get("t", "").strip(), got.get("l", "")
    node_script = first.startswith("#!") and any(w.rsplit("/", 1)[-1] == "node" for w in first[2:].split())
    needs = "node" if kind == "file" and node_script and not got.get("node", "").strip() else ""
    return Command(kind, needs, got.get("native", "").strip() if needs else "")


def look(ssh: SshMaster, name: str) -> Command:
    """command_type, plus whether that command can start at all."""
    script = _LOOK.replace("{n}", shlex.quote(name))
    res = ssh.run(f"bash -ic {shlex.quote(script)} 2>/dev/null </dev/null", timeout=45)
    return parse_look(res.stdout)


def cd_part(workdir: str) -> str:
    workdir = workdir.strip() or "~"
    if workdir == "~":
        return 'cd "$HOME"'
    if workdir.startswith("~/"):
        return f'cd "$HOME"/{shlex.quote(workdir[2:])}'
    return f"cd {shlex.quote(workdir)}"


def node_shell(workdir: str, command: str) -> str:
    """Run command in workdir, then stay in an interactive shell (bash -i so ~/.bashrc aliases work).
    Started inside tmux on the job's node (see tmux.open_line)."""
    inner = f"{cd_part(workdir)} && {command}; exec bash -i"
    return f"bash -ic {shlex.quote(inner)}"
