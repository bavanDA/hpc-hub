"""Who changed each line, and the story of one line."""

import shlex

from ...core.ssh import SshMaster
from ..git import ENV, GitError
from ..git_shell import g, rev, run
from .commits import commit
from .diff import changes

ZERO = "0" * 40


def parse_blame(text: str) -> dict:
    commits: dict[str, dict] = {}
    lines: list[list] = []
    cur = None
    for line in text.split("\n"):
        if line.startswith("\t"):
            if cur:
                lines.append([cur[0], cur[1]])
            continue
        head = line.split(" ")
        if len(head) >= 3 and len(head[0]) == 40 and all(c in "0123456789abcdef" for c in head[0]):
            cur = (head[0], int(head[1]))
            commits.setdefault(head[0], {"hash": head[0], "author": "", "time": 0, "summary": "", "path": "",
                                         "previous": None, "uncommitted": head[0] == ZERO})
        elif cur:
            c, (key, _, value) = commits[cur[0]], line.partition(" ")
            if key == "author":
                c["author"] = value
            elif key == "author-time":
                c["time"] = int(value or 0)
            elif key == "summary":
                c["summary"] = value
            elif key == "filename":
                c["path"] = value
            elif key == "previous":
                h, _, p = value.partition(" ")
                c["previous"] = {"hash": h, "path": p}
    return {"commits": commits, "lines": lines}


def relpath(folder: str, path: str) -> str:
    """A path the app sends (absolute in the project, or relative to it) as git takes it from the project folder."""
    if path.startswith(folder.rstrip("/") + "/"):
        return path[len(folder.rstrip("/")) + 1:]
    if path.startswith("/") or ".." in path.split("/"):
        raise GitError("That file is outside the project")
    return path


def blame(ssh: SshMaster, folder: str, path: str, at: str = "", lines: tuple[int, int] | None = None) -> dict:
    """Who last changed each line ({commits by hash, lines: [[hash, line in that commit], ...]}). at "" is the file
    now: lines not committed yet have the zero hash."""
    span = f"-L {int(lines[0])},{int(lines[1])}" if lines else ""
    if at:  # a path from the repository's top
        if path.startswith("/") or ".." in path.split("/"):
            raise GitError("Bad path")
        cmd = (f"cd {shlex.quote(folder)} && cd \"$(git rev-parse --show-toplevel)\" && {ENV} git blame --porcelain -w "
               f"{span} {shlex.quote(rev(at))} -- {shlex.quote(path)}")
    else:
        cmd = f"{g(folder)} blame --porcelain -w {span} -- {shlex.quote(relpath(folder, path))}"
    return parse_blame(run(ssh, cmd, timeout=120))


def line_story(ssh: SshMaster, folder: str, path: str, line: int, at: str = "") -> dict:
    """The commit that last changed one line: its message, the line before and after, how many more lines the
    commit changed, and where the line came from before that (to follow it further back)."""
    b = blame(ssh, folder, path, at, (line, line))
    if not b["lines"]:
        raise GitError("No such line")
    h, orig = b["lines"][0]
    c = b["commits"][h]
    if c["uncommitted"]:
        return {"uncommitted": True, "line": line}
    full = commit(ssh, folder, h)
    diff = changes(ssh, folder, "", h, context=0)
    rows = [r for f in diff["files"] if f["path"] == c["path"] for hk in f["hunks"] for r in hk["rows"]]
    after = next((i for i, r in enumerate(rows) if r["k"] == "+" and r["n"] == orig), -1)
    pair = []
    if after >= 0:
        before = next((r for r in reversed(rows[:after]) if r["k"] == "-" and r["m"]), None) \
            if rows[after]["m"] else None
        pair = ([before] if before else []) + [rows[after]]
    older = None
    prev = c["previous"]
    if prev and pair and pair[0]["k"] == "-":
        try:
            ob = blame(ssh, folder, prev["path"], prev["hash"], (pair[0]["o"], pair[0]["o"]))
            oh, _ = ob["lines"][0]
            oc = ob["commits"][oh]
            older = {"rev": prev["hash"], "path": prev["path"], "line": pair[0]["o"], "hash": oh,
                     "subject": oc["summary"], "author": oc["author"], "time": oc["time"]}
        except GitError:
            older = None
    shown = len(pair)
    return {"uncommitted": False, "commit": {k: v for k, v in full.items() if k != "files"}, "path": c["path"],
            "line": orig, "rows": pair, "more": max(0, full["added"] + full["removed"] - shown), "older": older}
