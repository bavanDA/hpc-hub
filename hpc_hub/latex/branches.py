"""Changes kept on a branch you leave live on refs/hpc-hub/aside/<branch> until you return."""

import re
import shlex
from collections.abc import Callable

from ..core.ssh import SshMaster
from . import saved
from .git import ENV, GitError
from .git_shell import SEP, g, parts, rev, run

ASIDE = "refs/hpc-hub/aside/"
HUNK_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)", re.M)


def _target(ssh: SshMaster, folder: str, name: str) -> dict:
    """A branch name -> {name (local), ref, remote_only}. origin/x picks the local copy x if there is one."""
    G = g(folder)
    name = rev(name)
    remotes = run(ssh, f"{G} remote").split()
    local = name
    for r in remotes:
        if name.startswith(r + "/"):
            local = name[len(r) + 1:]
    if ssh.run(f"{G} rev-parse -q --verify refs/heads/{shlex.quote(local)}", timeout=30).returncode == 0:
        return {"name": local, "ref": f"refs/heads/{local}", "remote_only": False, "remote": ""}
    for r in ([name.split("/", 1)[0]] if local != name else []) + remotes:
        if ssh.run(f"{G} rev-parse -q --verify refs/remotes/{r}/{shlex.quote(local)}", timeout=30).returncode == 0:
            return {"name": local, "ref": f"refs/remotes/{r}/{local}", "remote_only": True, "remote": r}
    raise GitError(f"No branch {name}")


def check(ssh: SshMaster, folder: str, target: str) -> dict:
    """The dry run before a switch: your changes, how many files differ on the target, and the spots that would
    clash ([{path, line}]); bring is True when your changes can come along."""
    t = _target(ssh, folder, target)
    G, ref = g(folder), shlex.quote(t["ref"])
    p = parts(run(ssh, f"{G} branch --show-current; echo {SEP}; {G} diff HEAD --numstat --no-color -- . {saved.SKIP}; "
                       f"echo {SEP}; cd {shlex.quote(folder)} && {ENV} git ls-files --full-name -o --exclude-standard "
                       f"-- . {saved.SKIP} | head -n 300; echo {SEP}; {G} diff --name-only HEAD {ref} -- :/"), 4)
    changes = [{"path": c[2], "added": int(c[0]) if c[0].isdigit() else 0, "removed": int(c[1]) if c[1].isdigit()
                else 0, "new": False} for c in (x.split("\t") for x in p[1].splitlines()) if len(c) == 3]
    new = [x for x in p[2].splitlines() if x]
    differs = set(x for x in p[3].splitlines() if x)
    clash = [c["path"] for c in changes if c["path"] in differs]
    if clash and changes:
        # maybe git can carry them over anyway: merge them, in objects only, onto the target
        snap = saved.snapshot(ssh, folder, "Switch check", new_files=False)
        res = ssh.run(f"{G} merge-tree --write-tree --name-only --merge-base=HEAD {ref} {snap['commit']}", timeout=60)
        if res.returncode == 0:
            clash = []
        elif res.returncode == 1:
            names = res.stdout.split("\n\n")[0].splitlines()[1:]
            clash = [n for n in names if n in differs] or clash
    clash += [n for n in new if n in differs]  # a new file of yours that the target has too
    spots = []
    for path in clash:
        d = ssh.run(f"{G} diff -U0 --no-color HEAD {ref} -- :/{shlex.quote(path)} | head -c 20000", timeout=30).stdout
        m = HUNK_RE.search(d)
        spots.append({"path": path, "line": int(m.group(1)) if m else 0})
    return {"from": p[0].strip(), "target": t["name"], "remote_only": t["remote_only"], "files": len(differs),
            "changes": changes + [{"path": n, "added": 0, "removed": 0, "new": True} for n in new],
            "clash": spots, "bring": not spots}


def switch(ssh: SshMaster, folder: str, target: str, mode: str, step: Callable[[str], None]) -> dict:
    """mode bring: your changes come along; keep: they stay with the branch you leave (and come back when you
    return to it). A safe copy is kept first either way."""
    if mode not in ("bring", "keep"):
        raise ValueError(f"No mode {mode}")
    c = check(ssh, folder, target)
    t = _target(ssh, folder, target)
    G, here = g(folder), c["from"]
    if not here:
        here = "detached"
    tracked = [x for x in c["changes"] if not x["new"]]
    if mode == "bring" and c["clash"]:
        raise GitError(f"Your changes clash with {t['name']} in {c['clash'][0]['path']}. Keep them on {here} instead.")
    if c["changes"]:
        n = len(c["changes"])
        step(f"Made a safe copy of your {n} {'change' if n == 1 else 'changes'}")
        saved.save(ssh, folder, f"Before switching to {t['name']}", force=True)
    remotes = run(ssh, f"{G} remote").split()
    if remotes:
        step("Got the latest from origin")
        ssh.run(f"{G} fetch -q {shlex.quote(t['remote'] or ('origin' if 'origin' in remotes else remotes[0]))}",
                timeout=300)
    step(f"Updating {c['files']} {'file' if c['files'] == 1 else 'files'}")
    if mode == "keep" and tracked:
        aside = saved.snapshot(ssh, folder, f"Kept on {here}", new_files=False)["commit"]
        run(ssh, f"{G} update-ref {ASIDE}{here} {aside} && {G} reset -q && {G} reset -q --hard")
        tracked = []
    merge = "-m" if tracked else ""
    if t["remote_only"]:
        cmd = f"{G} checkout -q {merge} -b {shlex.quote(t['name'])} --track {shlex.quote(t['ref'][13:])}"
    else:
        cmd = f"{G} checkout -q {merge} {shlex.quote(t['name'])}"
    res = ssh.run(cmd, timeout=300)
    if res.returncode != 0:
        if mode == "keep" and c["changes"]:
            restore_aside(ssh, folder, here)
        raise GitError(res.stderr.strip() or "Could not switch")
    if not tracked:
        ssh.run(f"{G} merge -q --ff-only '@{{u}}'", timeout=120)  # the latest from origin, when it is just newer
    back = restore_aside(ssh, folder, t["name"])
    return {"branch": t["name"], "from": here, "brought": len(c["changes"]) if mode == "bring" else 0,
            "kept": len(c["changes"]) if mode == "keep" else 0, "back": back}


def restore_aside(ssh: SshMaster, folder: str, branch: str) -> str:
    """Changes kept with a branch come back when you are on it again: "back", "kept" (they would not apply
    cleanly, so they wait), or "" (none)."""
    G, ref = g(folder), f"{ASIDE}{rev(branch)}"
    aside = ssh.run(f"{G} rev-parse -q --verify {ref}", timeout=30).stdout.strip()
    if not aside:
        return ""
    res = ssh.run(f"cd {shlex.quote(folder)} && top=$(git rev-parse --show-toplevel) && "
                  f"{G} diff --binary --no-color {aside}^ {aside} | (cd \"$top\" && {ENV} git apply --binary -)",
                  timeout=120)
    if res.returncode != 0:
        return "kept"
    run(ssh, f"{G} update-ref -d {ref}")
    return "back"


def new_branch(ssh: SshMaster, folder: str, name: str, start: str = "") -> str:
    """A new branch from a commit (HEAD if ""), switched to; your changes not committed yet come along."""
    G = g(folder)
    if ssh.run(f"{G} check-ref-format --branch {shlex.quote(name)}", timeout=30).returncode != 0 or \
            name.startswith("-"):
        raise GitError(f"{name} can't be a branch name")
    run(ssh, f"{G} checkout -q -b {shlex.quote(name)} {shlex.quote(rev(start)) if start else ''}")
    return name
