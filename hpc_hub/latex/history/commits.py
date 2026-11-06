"""Commits: the log, one commit, what two branches do not share, and a file as it was."""

import re
import shlex

from ...core.ssh import SshMaster
from ..git import GitError
from ..git_shell import SEP, g, parts, rev, run

FMT = "%x1e" + "%x1f".join(["%H", "%h", "%an", "%ae", "%at", "%P", "%D", "%s", "%b"]) + "%x1d"


def new_path(p: str) -> str:
    """numstat's rename forms (a => b, dir/{a => b}/c) -> the new path."""
    p = re.sub(r"\{[^{}]* => ([^{}]*)\}", r"\1", p)
    return re.sub(r"//+", "/", p.split(" => ")[-1])


def numstat(text: str) -> list[dict]:
    """git's --numstat lines as {path, added, removed, binary}."""
    out = []
    for line in text.splitlines():
        cols = line.split("\t")
        if len(cols) == 3:
            a, d, p = cols
            out.append({"path": new_path(p), "added": int(a) if a.isdigit() else 0,
                        "removed": int(d) if d.isdigit() else 0, "binary": a == "-"})
    return out


def parse_log(text: str) -> list[dict]:
    out = []
    for rec in text.split("\x1e")[1:]:
        head, _, stats = rec.partition("\x1d")
        f = head.split("\x1f")
        if len(f) < 9:
            continue
        files = numstat(stats)
        refs = [r.strip() for r in f[6].split(",") if r.strip()]
        out.append({"hash": f[0], "short": f[1], "author": f[2], "email": f[3], "time": int(f[4] or 0),
                    "parents": f[5].split(), "tags": [r[5:] for r in refs if r.startswith("tag: ")],
                    "branches": [r.removeprefix("HEAD -> ") for r in refs if not r.startswith("tag: ") and r != "HEAD"],
                    "subject": f[7], "body": f[8].strip(), "files": files,
                    "added": sum(x["added"] for x in files), "removed": sum(x["removed"] for x in files)})
    return out


def log(ssh: SshMaster, folder: str, ref: str = "HEAD", limit: int = 300, stats: bool = True) -> list[dict]:
    """Commits newest first, each with its files and lines added and removed. [] before the first commit."""
    numstat = "--numstat" if stats else ""
    res = ssh.run(f"{g(folder)} log {shlex.quote(rev(ref))} -n {int(limit)} {numstat} --no-color "
                  f"--format={shlex.quote(FMT)} --", timeout=120)
    if res.returncode != 0:
        if "does not have any commits" in res.stderr or "unknown revision" in res.stderr:
            return []
        raise GitError(res.stderr.strip() or "git log failed")
    return parse_log(res.stdout)


def commit(ssh: SshMaster, folder: str, ref: str) -> dict:
    found = parse_log(run(ssh, f"{g(folder)} log -1 --numstat --no-color --format={shlex.quote(FMT)} "
                               f"{shlex.quote(rev(ref))} --"))
    if not found:
        raise GitError(f"No commit {ref}")
    return found[0]


def lanes(ssh: SshMaster, folder: str, a: str, b: str) -> dict:
    G, qa, qb = g(folder), shlex.quote(rev(a)), shlex.quote(rev(b))
    base = run(ssh, f"{G} merge-base {qa} {qb} || true").strip()
    fmt = shlex.quote(FMT)
    p = parts(run(ssh, f"{G} log -n 200 --no-color --format={fmt} {qb}..{qa} --; echo {SEP}; "
                       f"{G} log -n 200 --no-color --format={fmt} {qa}..{qb} --"), 2)
    return {"base": base, "a": a, "b": b, "only_a": parse_log(p[0]), "only_b": parse_log(p[1])}


def file_at(ssh: SshMaster, folder: str, at: str, path: str) -> str:
    if path.startswith("/") or ".." in path.split("/"):
        raise GitError("Bad path")
    return run(ssh, f"{g(folder)} show {shlex.quote(rev(at) + ':' + path)} | head -c 8000000")
