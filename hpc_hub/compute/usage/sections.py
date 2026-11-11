import re
import shlex

from ...core.ssh import SshMaster


def sections(text: str) -> dict[str, list[str]]:
    """Lines under each @NAME marker of a script's output."""
    out: dict[str, list[str]] = {}
    cur = ""
    for line in text.splitlines():
        if re.fullmatch(r"@[A-Z]+", line.strip()):
            cur = line.strip()[1:]
            out[cur] = []
        elif cur:
            out[cur].append(line)
    return out


def qos_factors(lines: list[str]) -> dict[str, float]:
    """sacctmgr's name|usagefactor lines."""
    out = {}
    for line in lines:
        p = line.split("|")
        try:
            out[p[0]] = float(p[1])
        except (IndexError, ValueError):
            pass
    return out


def run_script(ssh: SshMaster, script: str, *args: str) -> str:
    line = f"bash -c {shlex.quote(script)} _ " + " ".join(shlex.quote(a) for a in args)
    return ssh.read(line, timeout=120).stdout
