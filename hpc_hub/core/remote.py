"""Command lines for the cluster's shell: command lookup, cd, run on a node."""

import shlex

from .ssh import SshMaster


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


def node_shell(workdir: str, command: str) -> str:
    """Run command in workdir, then stay in an interactive shell (bash -i so ~/.bashrc aliases work).
    Started inside tmux on the job's node (see tmux.open_line)."""
    inner = f"{cd_part(workdir)} && {command}; exec bash -i"
    return f"bash -ic {shlex.quote(inner)}"
