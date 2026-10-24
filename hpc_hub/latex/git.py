"""Git for a project folder on the cluster: remote, branch, history, commit, pull, push."""

import shlex
from dataclasses import dataclass, field

from ..core.ssh import SshMaster

ENV = "GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes'"
LOG_FORMAT = "%h%x09%ad%x09%an%x09%s"


class GitError(Exception):
    pass


@dataclass
class Commit:
    hash: str
    date: str
    author: str
    subject: str


@dataclass
class RepoInfo:
    root: str = ""
    branch: str = ""
    remotes: dict[str, str] = field(default_factory=dict)
    changes: list[str] = field(default_factory=list)
    history: list[Commit] = field(default_factory=list)


def _git(ssh: SshMaster, folder: str, args: str, timeout: float = 120) -> str:
    res = ssh.run(f"{ENV} git -C {shlex.quote(folder)} {args}", timeout=timeout)
    if res.returncode != 0:
        raise GitError(res.stderr.strip() or res.stdout.strip() or f"git {args.split()[0]} failed")
    return res.stdout


def parse_remotes(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            out.setdefault(parts[0], parts[1])
    return out


def parse_log(text: str) -> list[Commit]:
    return [Commit(*line.split("\t", 3)) for line in text.splitlines() if line.count("\t") >= 3]


def info(ssh: SshMaster, folder: str) -> RepoInfo:
    sep = "@@hpchub@@"
    script = (f"{ENV} git -C {shlex.quote(folder)} rev-parse --show-toplevel || exit 3; echo {sep}; "
              f"git -C {shlex.quote(folder)} branch --show-current; echo {sep}; "
              f"git -C {shlex.quote(folder)} remote -v; echo {sep}; "
              f"git -C {shlex.quote(folder)} status --porcelain; echo {sep}; "
              f"git -C {shlex.quote(folder)} log --date=short --pretty=format:{shlex.quote(LOG_FORMAT)} -n 200"
              " 2>/dev/null; true")  # a new repository has no commits yet: no history, not an error
    res = ssh.run(script, timeout=60)
    if res.returncode == 3:
        return RepoInfo()
    if res.returncode != 0:
        raise GitError(res.stderr.strip() or "git failed")
    parts = (res.stdout.split(sep + "\n") + [""] * 5)[:5]
    return RepoInfo(root=parts[0].strip(), branch=parts[1].strip(), remotes=parse_remotes(parts[2]),
                    changes=[c for c in parts[3].splitlines() if c.strip()], history=parse_log(parts[4]))


BUILD_FILES = ("aux", "log", "out", "toc", "fls", "fdb_latexmk", "synctex.gz", "bbl", "blg", "lof", "lot", "nav", "snm")


def commit_all(ssh: SshMaster, folder: str, message: str) -> str:
    """Stage everything except LaTeX build files, then commit."""
    skip = " ".join(shlex.quote(f":!*.{ext}") for ext in BUILD_FILES)
    commit = f"{ENV} git -C {shlex.quote(folder)} commit -m {shlex.quote(message)}"
    return _git(ssh, folder, f"add -A -- . {skip} && {commit}")


def pull(ssh: SshMaster, folder: str) -> str:
    return _git(ssh, folder, "pull --ff-only", timeout=300)


def push(ssh: SshMaster, folder: str) -> str:
    return _git(ssh, folder, "push", timeout=300)


def show(ssh: SshMaster, folder: str, commit: str) -> str:
    if not all(c in "0123456789abcdef" for c in commit):
        raise GitError("Bad commit id")
    return _git(ssh, folder, f"show --stat --patch --no-color {commit} | head -c 400000")
