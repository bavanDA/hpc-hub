"""What changed between two versions, or since the last commit."""

import shlex

from ...core.ssh import SshMaster
from ..git import ENV, GitError
from ..git_shell import EMPTY_TREE, SEP, SKIP, g, parts, rev, run
from .diff_moves import mark
from .diff_parse import parse_diff

DIFF_LIMIT = 3_000_000


def changes(ssh: SshMaster, folder: str, frm: str = "", to: str = "", context: int = 3) -> dict:
    """What changed from one version to another. to "" is the files now (new files too, build files left out);
    frm "" is to's parent (HEAD for the files now)."""
    G = g(folder)
    if to:
        to = rev(to)
        if not frm:
            parents = run(ssh, f"{G} rev-list --parents -n 1 {shlex.quote(to)}").split()
            frm = parents[1] if len(parents) > 1 else EMPTY_TREE
        script = (f"{G} diff --no-color --no-ext-diff -M -U{int(context)} {shlex.quote(rev(frm))} {shlex.quote(to)} "
                  f"-- :/ {SKIP} | head -c {DIFF_LIMIT}")
    else:
        has_head = ssh.run(f"{G} rev-parse -q --verify HEAD", timeout=30).returncode == 0
        frm = rev(frm) if frm else ("HEAD" if has_head else EMPTY_TREE)
        q = shlex.quote(folder)
        # new files are not in git yet: each one as a diff against nothing, without touching the index
        new = (f"cd {q} && {ENV} git ls-files -z -o --exclude-standard -- . {SKIP} | head -z -n 100 | "
               f"while IFS= read -r -d '' f; do {ENV} git diff --no-color --no-index -- /dev/null \"$f\"; done")
        script = (f"{G} rev-parse --show-prefix; echo {SEP}; "
                  f"{G} diff --no-color --no-ext-diff -M -U{int(context)} {shlex.quote(frm)} -- . {SKIP} "
                  f"| head -c {DIFF_LIMIT}; echo {SEP}; {new} | head -c {DIFF_LIMIT}")
    res = ssh.run(script, timeout=180)
    if res.returncode != 0 and not res.stdout:
        raise GitError(res.stderr.strip() or "git diff failed")
    if to:
        files = parse_diff(res.stdout)
        size = len(res.stdout)
    else:
        prefix, tracked, untracked = parts(res.stdout, 3)
        files = parse_diff(tracked)
        for f in parse_diff(untracked):  # named from the project folder: from the top, like the rest
            f.update(path=prefix.strip() + f["path"], old_path="", status="A")
            files.append(f)
        size = max(len(tracked), len(untracked))
    for f in files:
        if f["status"] == "A":
            f["old_path"] = ""
    moves = mark(files)
    return {"from": frm, "to": to, "files": files, "moves": moves, "truncated": size >= DIFF_LIMIT,
            "added": sum(f["added"] for f in files), "removed": sum(f["removed"] for f in files)}
