"""Git on the cluster in shell scripts: one trip runs several commands, their outputs split by SEP."""

import re
import shlex

from ..core.ssh import SshMaster
from .git import BUILD_FILES, ENV, GitError

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"  # git's tree with nothing in it: the root commit's parent
SKIP = " ".join(shlex.quote(f":(top,exclude)*.{e}") for e in BUILD_FILES)  # build files are left out everywhere
REV_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._/@^~{}+-]*$")
SEP = "@@hpchub@@"


def rev(name: str) -> str:
    """A branch, tag or commit as the app may pass it on to git."""
    if not REV_RE.match(name or "") or ".." in name:
        raise GitError(f"No version {name!r}")
    return name


def g(folder: str) -> str:
    return f"{ENV} git -C {shlex.quote(folder)}"


def run(ssh: SshMaster, script: str, timeout: float = 120) -> str:
    res = ssh.run(script, timeout=timeout)
    if res.returncode != 0:
        raise GitError(res.stderr.strip() or res.stdout.strip() or "git failed")
    return res.stdout


def parts(text: str, n: int) -> list[str]:
    return (text.split(SEP + "\n") + [""] * n)[:n]
