"""Stop a safe push and put everything back."""

import shlex

from ...core.ssh import SshMaster
from ..git import ENV
from ..git_shell import g, run
from .record import ASIDE, ORIG, clear, load, where


def stop(ssh: SshMaster, folder: str) -> dict:
    """Put everything back. Before the push: your commits and your changes exactly as they were. After it (a spot
    when your changes came back): the files go back to the pushed version and your changes stay in Saved
    versions."""
    st = load(ssh, folder)
    if not st:
        root, gitdir = where(ssh, folder)
        G = g(root)
        orig = ssh.run(f"{G} rev-parse -q --verify {ORIG}", timeout=30).stdout.strip()
        if not orig:
            return {"stopped": False}
        st = {"root": root, "git_dir": gitdir, "orig": orig, "stage": "pull",
              "aside": ssh.run(f"{G} rev-parse -q --verify {ASIDE}", timeout=30).stdout.strip()}
    G, root = g(st["root"]), shlex.quote(st["root"])
    if st["stage"] == "back":
        run(ssh, f"{G} checkout -q -- {' '.join(shlex.quote(f) for f in st.get('files', []))}"
            if st.get("files") else "true")
        clear(ssh, st)
        return {"stopped": True, "kept": True}
    ssh.run(f"cd {root} && {ENV} git rebase --abort", timeout=120)
    run(ssh, f"{G} reset -q --hard {st['orig']}")
    if st["aside"]:
        run(ssh, f"cd {root} && {G} diff --binary --no-color {st['orig']} {st['aside']} | {ENV} git apply --binary -")
    clear(ssh, st)
    return {"stopped": True, "kept": False}
