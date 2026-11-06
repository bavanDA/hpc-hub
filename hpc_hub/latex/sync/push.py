"""Safe push: put your changes aside, pull first, push, then bring your changes back."""

import posixpath
import shlex
from collections.abc import Callable

from ...core.ssh import SshMaster
from ...files import remote_fs
from .. import saved
from ..git import ENV, GitError
from ..git_shell import SEP, g, parts, run
from .record import ASIDE, ORIG, clear, load, save, where
from .spots import resolve
from .status import status
from .stop import stop

Step = Callable[[str], None]


def start(ssh: SshMaster, folder: str, push: bool, step: Step) -> dict:
    """Push (or with push False, Get the latest) safely. Returns the end ({done: True, ...}) or, paused on spots to
    settle, the status."""
    if load(ssh, folder):
        return status(ssh, folder) or {}
    root, gitdir = where(ssh, folder)
    G = g(root)
    up = f"r=$({G} symbolic-ref -q HEAD) && {G} for-each-ref --format='%(upstream:short)' \"$r\""
    p = parts(run(ssh, f"{G} branch --show-current; echo {SEP}; {up}; "
                       f"echo {SEP}; {G} remote; echo {SEP}; {G} rev-parse -q --verify HEAD; echo {SEP}; "
                       f"ls -d {shlex.quote(gitdir)}/rebase-merge {shlex.quote(gitdir)}/rebase-apply "
                       f"{shlex.quote(gitdir)}/MERGE_HEAD 2>/dev/null; echo {SEP}; "
                       f"{G} status --porcelain --untracked-files=no -- . {saved.SKIP}; true"), 6)
    branch, upstream, remotes, head = p[0].strip(), p[1].strip(), p[2].split(), p[3].strip()
    if not branch:
        raise GitError("You are not on a branch. Pick one first.")
    if p[4].strip():
        raise GitError("git is in the middle of a merge or rebase here. Finish it in a terminal first.")
    remote = upstream.split("/", 1)[0] if upstream else ("origin" if "origin" in remotes else "")
    if not remote:
        raise GitError("This paper has no remote to pull from or push to.")
    changed = [x for x in p[5].splitlines() if x.strip()]
    st = {"push": push, "root": root, "git_dir": gitdir, "branch": branch, "remote": remote,
          "upstream": upstream or f"{remote}/{branch}", "tracking": bool(upstream), "orig": head, "aside": "",
          "stage": "aside", "changes": len(changed), "pulled": 0, "pulled_by": "", "pulled_at": 0, "pushed": 0,
          "files": []}
    if changed:
        step(f"Put your {len(changed)} {'change' if len(changed) == 1 else 'changes'} not committed yet aside")
        saved.save(ssh, root, "Before push" if push else "Before getting the latest", force=True)
        aside = saved.snapshot(ssh, root, "Put aside", new_files=False)["commit"]
        st["aside"] = aside
        save(ssh, st)
        run(ssh, f"{G} update-ref {ORIG} {head} && {G} update-ref {ASIDE} {aside} && "
            f"{G} reset -q && {G} reset -q --hard")  # unstaged first: a file only staged stays, as a new file
    else:
        run(ssh, f"{G} update-ref {ORIG} {head}")
    st["stage"] = "pull"
    save(ssh, st)
    return _pull(ssh, st, step)


def _marked(ssh: SshMaster, root: str, files: list[str]) -> list[str]:
    """The files that still have a spot marked in them."""
    return [f for f in files if ssh.run(f"grep -q '^<<<<<<< ' {shlex.quote(posixpath.join(root, f))}",
                                        timeout=30).returncode == 0]


def _pull(ssh: SshMaster, st: dict, step: Step) -> dict:
    G, up = g(st["root"]), shlex.quote(st["upstream"])
    step("Get the latest from origin")
    res = ssh.run(f"{G} fetch -q {shlex.quote(st['remote'])}", timeout=300)
    if res.returncode != 0:
        stop(ssh, st["root"])
        why = res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "no answer"
        raise GitError(f"Could not reach {st['remote']}: {why}")
    if ssh.run(f"{G} rev-parse -q --verify {up}", timeout=30).returncode != 0:  # a new branch: nothing to pull
        return _push(ssh, st, step)
    p = parts(run(ssh, f"{G} rev-list --count HEAD..{up}; echo {SEP}; {G} rev-list --count {up}..HEAD; echo {SEP}; "
                       f"{G} log -1 --format='%an%x1f%ct' {up}"), 3)
    incoming, ahead = int(p[0].strip() or 0), int(p[1].strip() or 0)
    who = p[2].strip().split("\x1f")
    st.update(pulled=incoming, pulled_by=who[0] if len(who) == 2 else "", pulled_at=int(who[1]) if len(who) == 2 else 0)
    if incoming and not ahead:
        run(ssh, f"cd {shlex.quote(st['root'])} && {ENV} GIT_REFLOG_ACTION='pull (HPC Hub)' "
                 f"git merge -q --ff-only {up}")
    elif incoming:
        # rebase, not merge: your commits were never pushed, and the history stays one line
        res = ssh.run(f"cd {shlex.quote(st['root'])} && {ENV} GIT_EDITOR=true GIT_REFLOG_ACTION='pull (HPC Hub)' "
                      f"git -c merge.conflictStyle=diff3 rebase -q {up}", timeout=300)
        if res.returncode != 0:
            if run(ssh, f"{G} diff --name-only --diff-filter=U").strip():
                save(ssh, st)
                return status(ssh, st["root"]) or {}
            stop(ssh, st["root"])
            raise GitError(res.stderr.strip() or "Could not put your commits on top of the latest")
    return _push(ssh, st, step)


def _push(ssh: SshMaster, st: dict, step: Step) -> dict:
    G, up = g(st["root"]), shlex.quote(st["upstream"])
    if st["push"]:
        known = ssh.run(f"{G} rev-parse -q --verify {up}", timeout=30).returncode == 0
        ahead = int(run(ssh, f"{G} rev-list --count {up}..HEAD" if known else f"{G} rev-list --count HEAD").strip()
                    or 0)
        if ahead:
            step(f"Push your {ahead} {'commit' if ahead == 1 else 'commits'}")
            track = "" if st["tracking"] else "-u"
            res = ssh.run(f"{G} push -q {track} {shlex.quote(st['remote'])} "
                          f"HEAD:refs/heads/{shlex.quote(st['branch'])}", timeout=300)
            if res.returncode != 0:
                end = _back(ssh, st, step)
                why = res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "the push failed"
                back = " Your changes are back." if st["aside"] and end.get("done") else ""
                raise GitError(f"Nothing was pushed: {why}.{back}")
            st["pushed"] = ahead
    return _back(ssh, st, step)


def _back(ssh: SshMaster, st: dict, step: Step) -> dict:
    G, root = g(st["root"]), shlex.quote(st["root"])
    if st["aside"]:
        step("Bring your changes back")
        files = [f for f in run(ssh, f"{G} diff --name-only {st['orig']} {st['aside']}").splitlines() if f]
        patch = f"{G} diff --binary --no-color {st['orig']} {st['aside']}"
        res = ssh.run(f"cd {root} && {patch} | {ENV} git apply --binary -", timeout=120)
        if res.returncode != 0:
            # what came in touched the same lines: a three-way apply leaves the spots marked in the files
            ssh.run(f"cd {root} && {patch} | {ENV} git -c merge.conflictStyle=diff3 apply --3way -; "
                    f"{ENV} git reset -q", timeout=120)
            marked = _marked(ssh, st["root"], files)
            if marked:
                st.update(stage="back", files=marked)
                save(ssh, st)
                return status(ssh, st["root"]) or {}
    clear(ssh, st)
    return {"done": True, "push": st["push"], "branch": st["branch"], "pulled": st["pulled"],
            "pulled_by": st["pulled_by"], "pushed": st["pushed"], "back": st["changes"] if st["aside"] else 0}


def settle(ssh: SshMaster, folder: str, path: str, picks: list[dict]) -> dict | None:
    """Settle every spot of one file; in the pull it is then marked settled for git."""
    st = load(ssh, folder)
    if not st:
        raise GitError("Nothing to settle")
    if path.startswith("/") or ".." in path.split("/"):
        raise GitError("Bad path")
    full = posixpath.join(st["root"], path)
    text = remote_fs.read_bytes(ssh, full).decode("utf-8", "replace")
    remote_fs.write_bytes(ssh, full, resolve(text, picks).encode())
    if st["stage"] == "pull":
        run(ssh, f"{g(st['root'])} add -- {shlex.quote(path)}")
    return status(ssh, folder)


def go_on(ssh: SshMaster, folder: str, step: Step) -> dict:
    """After the spots are settled: finish the pull, push, bring your changes back."""
    st = load(ssh, folder)
    if not st:
        raise GitError("Nothing to continue")
    G = g(st["root"])
    if st["stage"] == "pull":
        if run(ssh, f"{G} diff --name-only --diff-filter=U").strip():
            raise GitError("Settle every spot first")
        res = ssh.run(f"cd {shlex.quote(st['root'])} && {ENV} GIT_EDITOR=true GIT_REFLOG_ACTION='pull (HPC Hub)' "
                      f"git -c merge.conflictStyle=diff3 rebase --continue", timeout=300)
        if res.returncode != 0:
            if run(ssh, f"{G} diff --name-only --diff-filter=U").strip():
                return status(ssh, folder) or {}
            if "No changes" not in res.stdout + res.stderr and "nothing to commit" not in res.stdout + res.stderr:
                raise GitError(res.stderr.strip() or "Could not go on")
            run(ssh, f"cd {shlex.quote(st['root'])} && {ENV} git rebase --skip")  # your commit became empty
        return _push(ssh, st, step)
    left = _marked(ssh, st["root"], st["files"])
    if left:
        raise GitError("Settle every spot first")
    return _back(ssh, {**st, "aside": ""}, step) | {"back": st["changes"]}
