"""Branch and changed files of each git project on a cluster, for the project list."""

from ...files import remote_fs
from ..hub import hub
from ..server import method
from .projects import _home, _load

GIT_SECONDS = 10  # each git call; a slow folder only loses its own count

# prints "<path>\t<branch>\t<changed files>" (-1: status too slow), nothing when it isn't git
_GIT_ONE = (
    'b=$(timeout {t} git -C "$1" symbolic-ref --short -q HEAD 2>/dev/null'
    ' || timeout {t} git -C "$1" rev-parse --short HEAD 2>/dev/null) || return 0; '
    'if s=$(timeout {t} git -C "$1" status --porcelain 2>/dev/null); then n=$(printf %s "$s" | grep -c .); '
    'else n=-1; fi; printf "%s\\t%s\\t%s\\n" "$1" "$b" "$n"'
).format(t=GIT_SECONDS)


def git_command(paths: list[str]) -> str:
    each = " ".join(f"one {remote_fs.q(p)} &" for p in paths)
    return f"one() {{ {_GIT_ONE}; }}; {each} wait"


@method("projects.status")
def status(cluster: str) -> dict:
    """By project path, in one ssh command; nothing while the cluster isn't connected."""
    s = hub().sessions.get(cluster)
    if not s or not s.connected:
        return {}
    paths = {p.path for p in _load() if p.cluster == cluster}
    if not paths:
        return {}
    home = _home(cluster) if any(p.startswith("~") for p in paths) else ""
    full = {home + p[1:] if p.startswith("~") else p: p for p in paths}
    res = s.ssh.run(git_command(sorted(full)), timeout=GIT_SECONDS * 2 + 30)
    out = {}
    for line in res.stdout.splitlines():
        path, branch, changed = (line.rsplit("\t", 2) + ["", ""])[:3]
        if path in full and changed.lstrip("-").isdigit():
            out[full[path]] = {"branch": branch, "changed": int(changed)}
    return out
