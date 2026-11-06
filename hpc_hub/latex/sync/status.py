"""Where a push or Get the latest stands, with the spots left to settle."""

import posixpath
import shlex

from ...core.ssh import SshMaster
from ...files import remote_fs
from ..git_shell import g, run
from .record import load
from .spots import blocks


def status(ssh: SshMaster, folder: str) -> dict | None:
    """Where a push or Get the latest stands, with the spots to settle; None when none is under way."""
    st = load(ssh, folder)
    if not st:
        return None
    root, G = st["root"], g(st["root"])
    if st["stage"] == "pull":
        files = [f for f in run(ssh, f"{G} diff --name-only --diff-filter=U").splitlines() if f]
    else:
        files = st.get("files", [])
    mine = run(ssh, f"{G} log -1 --format='%h%x1f%s%x1f%an' REBASE_HEAD 2>/dev/null || true").strip().split("\x1f") \
        if st["stage"] == "pull" else []
    spots = []
    for f in files:
        text = remote_fs.read_bytes(ssh, posixpath.join(root, f)).decode("utf-8", "replace")
        found = blocks(text)
        if not found:
            continue
        who = run(ssh, f"{G} log -1 --format='%h%x1f%s%x1f%an' {st['orig']}..{shlex.quote(st['upstream'])} -- "
                       f"{shlex.quote(f)} 2>/dev/null || true").strip().split("\x1f")
        for k, b in enumerate(found):
            spots.append({"path": f, "index": k, **b,
                          "theirs_commit": dict(zip(("hash", "subject", "author"), who, strict=False))
                          if len(who) == 3 else None,
                          "mine_commit": dict(zip(("hash", "subject", "author"), mine, strict=False))
                          if len(mine) == 3 else None})
    return {**st, "spots": spots}
