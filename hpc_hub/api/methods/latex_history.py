"""A paper's history (the History tab, the timeline, Who changed it): commits, changes with words marked, blame,
branches, safe push, saved versions and PDFs of other versions. Git runs over the connection, never on a compute
node; only the PDF builds of other versions run where Recompile does.

Steps of longer work (switching branch, a push) come as `latex-git` events {id, cluster, folder, kind, steps:
[{label, seconds, done}], done, ok, error, result}; a PDF of another version ends with a `latex-git-pdf` event
{id, cluster, folder, ok, path, error, seconds}."""

import posixpath
import secrets
import shlex
import threading
import time
from collections.abc import Callable

from ...latex import branches, history, pdfdiff, saved, sync
from ..hub import hub
from ..server import method
from .latex import _ssh, _sync

_lock = threading.Lock()
_busy: dict[tuple[str, str], str] = {}  # (cluster, folder) -> what runs there now


def _job(kind: str, cluster: str, folder: str, work: Callable[[Callable[[str], None]], dict]) -> dict:
    """Run work(step) in the background; each step(label) and the end go out as `latex-git` events. One at a time
    per paper. Returns {id}."""
    key = (cluster, folder.rstrip("/"))
    with _lock:
        if key in _busy:
            raise RuntimeError(f"Wait for the {_busy[key]} to finish")
        _busy[key] = {"switch": "switch", "push": "push", "pull": "update"}.get(kind, kind)
    jid, h = secrets.token_hex(6), hub()
    steps: list[dict] = []
    clock = [time.monotonic()]

    def emit(**extra):
        h.emit("latex-git", {"id": jid, "cluster": cluster, "folder": folder, "kind": kind, "steps": steps,
                             "done": False, **extra})

    def step(label: str):
        now = time.monotonic()
        if steps:
            steps[-1].update(done=True, seconds=round(now - clock[0], 1))
        clock[0] = now
        steps.append({"label": label, "seconds": 0, "done": False})
        emit()

    def run():
        try:
            result = work(step)
            if steps:
                steps[-1].update(done=True, seconds=round(time.monotonic() - clock[0], 1))
            emit(done=True, ok=True, result=result)
        except Exception as e:  # noqa: BLE001 (it goes to the app as the job's end)
            emit(done=True, ok=False, error=str(e) or type(e).__name__)
        finally:
            with _lock:
                _busy.pop(key, None)
    threading.Thread(target=run, daemon=True, name=f"git-{kind}-{jid}").start()
    return {"id": jid}


# -- reading -------------------------------------------------------------------------------------------------------
@method("latex.git_state")
def git_state(cluster: str, folder: str) -> dict:
    """{root, git_dir, prefix, branch, head, upstream, ahead, behind, fetched, user, email, login, changes:
    [{path, added, removed, new}], saved: off|cluster|backup, saved_at, syncing, remotes}; root "" when the
    folder is not a repository. Paths are from the repository's top (prefix is the project folder's)."""
    return history.state(_ssh(cluster), folder)


@method("latex.git_log")
def git_log(cluster: str, folder: str, ref: str = "HEAD", limit: int = 300) -> list[dict]:
    """Commits newest first: {hash, short, author, email, time, parents, tags, branches, subject, body, files:
    [{path, added, removed, binary}], added, removed}."""
    return history.log(_ssh(cluster), folder, ref or "HEAD", max(1, min(int(limit), 2000)))


@method("latex.git_changes")
def git_changes(cluster: str, folder: str, frm: str = "", to: str = "", context: int = 3) -> dict:
    """What changed from frm to to (to "" = the files now, frm "" = to's parent): {from, to, added, removed,
    truncated, files: [{path, old_path, status A|M|D|R, binary, added, removed, hunks: [{old, new, header, rows}]}],
    moves: [{id, lines, changes, from: {path, line, end}, to: {...}}]}. A row is {k: " "|"-"|"+", o, n, t, m:
    [[from, to]] changed words, mv?, same?, src?} (see hpc_hub/latex/history.py)."""
    return history.changes(_ssh(cluster), folder, frm, to, max(0, min(int(context), 50)))


@method("latex.git_blame")
def git_blame(cluster: str, folder: str, path: str) -> dict:
    """Who last changed each line of a file now: {commits: {hash: {hash, author, time, summary, path, previous,
    uncommitted}}, lines: [[hash, line in that commit], ...]} (one per line, in order)."""
    return history.blame(_ssh(cluster), folder, path)


@method("latex.git_line")
def git_line(cluster: str, folder: str, path: str, line: int, at: str = "") -> dict:
    """The commit that last changed a line (path is the file now, or with at a version, a path from the top):
    {uncommitted, commit, path, line, rows (the line before and after), more, older: {rev, path, line, hash,
    subject, author, time} or None}."""
    return history.line_story(_ssh(cluster), folder, path, int(line), at)


@method("latex.git_refs")
def git_refs(cluster: str, folder: str) -> dict:
    """{current, branches: [{name, hash, time, author, subject, upstream, current, new}], remote, remote_only:
    [{name, local, hash, time, author, subject}], tags, last_pull: {hash, time} | None, mine: {hash, time,
    subject} | None}."""
    return history.refs(_ssh(cluster), folder)


@method("latex.git_lanes")
def git_lanes(cluster: str, folder: str, a: str, b: str) -> dict:
    """Two branches: {base, a, b, only_a, only_b} (commits as git_log, without files)."""
    return history.lanes(_ssh(cluster), folder, a, b)


@method("latex.git_file")
def git_file(cluster: str, folder: str, at: str, path: str) -> dict:
    """A file as it was in a version: {text}."""
    return {"text": history.file_at(_ssh(cluster), folder, at, path)}


@method("latex.git_sync_lines")
def git_sync_lines(cluster: str, main: str, path: str, lines: list[int]) -> list[dict | None]:
    """SyncTeX for many lines at once (to mark changes on the PDF): [{line, page, x, y} or None]."""
    st = _sync(cluster, main)
    if not st:
        raise RuntimeError("Build once to link the PDF and the source")
    out = []
    for n in lines[:2000]:
        spot = st.view(path, int(n), posixpath.dirname(main))
        out.append({"line": int(n), "page": spot.page, "x": spot.x, "y": spot.y} if spot else None)
    return out


# -- branches --------------------------------------------------------------------------------------------------------
@method("latex.git_switch_check")
def git_switch_check(cluster: str, folder: str, target: str) -> dict:
    """The dry run before switching: {from, target, remote_only, files, changes, clash: [{path, line}], bring}."""
    return branches.check(_ssh(cluster), folder, target)


@method("latex.git_switch")
def git_switch(cluster: str, folder: str, target: str, mode: str = "bring") -> dict:
    """Switch branch; mode bring (your changes come along) or keep (they stay with this branch). Steps as
    `latex-git` events; the result {branch, from, brought, kept, back}."""
    ssh = _ssh(cluster)
    return _job("switch", cluster, folder, lambda step: branches.switch(ssh, folder, target, mode, step))


@method("latex.git_new_branch")
def git_new_branch(cluster: str, folder: str, name: str, start: str = "") -> str:
    """A new branch from a commit (HEAD if ""), switched to; your changes come along."""
    return branches.new_branch(_ssh(cluster), folder, name.strip(), start)


# -- safe push and Get the latest ------------------------------------------------------------------------------------
@method("latex.git_sync")
def git_sync(cluster: str, folder: str, push: bool = True) -> dict:
    """Push (push False: Get the latest), always pulling first. Steps as `latex-git` events; the result is either
    {done: True, push, branch, pulled, pulled_by, pushed, back} or, paused on spots to settle, the state (as
    git_sync_state)."""
    ssh = _ssh(cluster)
    return _job("push" if push else "pull", cluster, folder, lambda step: sync.start(ssh, folder, bool(push), step))


@method("latex.git_sync_state")
def git_sync_state(cluster: str, folder: str) -> dict | None:
    """A push or Get the latest under way: {push, stage: pull|back, branch, upstream, pulled, pulled_by, pulled_at,
    changes, spots: [{path, index, line, end, mine, theirs, base, before, after, mine_commit, theirs_commit}]} or
    None."""
    return sync.status(_ssh(cluster), folder)


@method("latex.git_settle")
def git_settle(cluster: str, folder: str, path: str, picks: list[dict]) -> dict | None:
    """Settle every spot of one file: picks [{take: mine|theirs|both|edit, text}] in order. Returns the state."""
    return sync.settle(_ssh(cluster), folder, path, picks)


@method("latex.git_sync_continue")
def git_sync_continue(cluster: str, folder: str) -> dict:
    """Go on after settling: finish the pull, push, bring your changes back. As git_sync."""
    ssh = _ssh(cluster)
    st = sync.load(ssh, folder)
    kind = "push" if not st or st.get("push") else "pull"
    return _job(kind, cluster, folder, lambda step: sync.go_on(ssh, folder, step))


@method("latex.git_sync_stop")
def git_sync_stop(cluster: str, folder: str) -> dict:
    """Stop and put everything back: {stopped, kept (your changes are in Saved versions)}."""
    return sync.stop(_ssh(cluster), folder)


# -- saved versions --------------------------------------------------------------------------------------------------
@method("latex.git_saved")
def git_saved(cluster: str, folder: str, branch: str = "") -> list[dict]:
    """Saved versions of a branch (yours now if ""), newest first: {hash, time, kind, files, previous, base}."""
    return saved.versions(_ssh(cluster), folder, branch)


@method("latex.git_save_version")
def git_save_version(cluster: str, folder: str, kind: str = "Saved") -> dict:
    """Keep a version now (unless off or nothing changed): {saved: hash or "", why}."""
    return saved.save(_ssh(cluster), folder, kind[:60] or "Saved", force=True)


@method("latex.git_saved_setting")
def git_saved_setting(cluster: str, folder: str, mode: str) -> str:
    """off, cluster (the default) or backup (also pushed to origin as saved/<you>/<branch>)."""
    return saved.setting(_ssh(cluster), folder, mode)


@method("latex.git_restore")
def git_restore(cluster: str, folder: str, version: str) -> dict:
    """Make the files what they were in a saved version or commit; what you have now is saved first. {before}."""
    return saved.restore(_ssh(cluster), folder, version)


@method("latex.git_put_back")
def git_put_back(cluster: str, folder: str, path: str, line: int, expect: list[str], lines: list[str]) -> None:
    """Put some lines back: lines [line, line + len(expect)) of the file, if they still read expect, become lines.
    path is from the repository's top."""
    ssh = _ssh(cluster)
    if path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Bad path")
    root = history.state(ssh, folder)["root"]
    saved.put_back(ssh, f"{root}/{path}", int(line), expect, lines)


# -- PDFs of other versions ------------------------------------------------------------------------------------------
@method("latex.git_pdf")
def git_pdf(cluster: str, folder: str, main: str, version: str = "", against: str | None = None) -> dict:
    """The PDF of a version ("" = the files now), or with against, latexdiff's red and blue from against to
    version. {path} when it is kept already, else {id}: it builds where Recompile builds and ends with a
    `latex-git-pdf` event {id, ok, path, error, seconds}."""
    ssh, s = _ssh(cluster), hub().connected(cluster)
    p = pdfdiff.plan(ssh, folder, main, version, against, s.cfg.latex)
    if p["cached"]:
        return {"path": p["pdf"]}
    command = _node(cluster, p["script"])
    jid, started = secrets.token_hex(6), time.monotonic()

    def run():
        try:
            res = ssh.run(command, timeout=900)
            ok = res.returncode == 0
            error = "" if ok else pdfdiff.explain(res.returncode, res.stdout + res.stderr, s.cfg.name,
                                                  against is not None)
        except Exception as e:  # noqa: BLE001 (it goes to the app as the build's end)
            ok, error = False, str(e)
        hub().emit("latex-git-pdf", {"id": jid, "cluster": cluster, "folder": folder, "ok": ok,
                                     "path": p["pdf"] if ok else "", "error": error,
                                     "seconds": round(time.monotonic() - started, 1)})
    threading.Thread(target=run, daemon=True, name=f"git-pdf-{jid}").start()
    return {"id": jid}


def _node(cluster: str, script: str) -> str:
    """On your compute node when Recompile builds there (the same rule as latex.build)."""
    s = hub().connected(cluster)
    a = s.allocation
    if a and a.job_id and s.cfg.latex.on_node:
        return f"srun --jobid={int(a.job_id)} --overlap bash -c {shlex.quote(script)}"
    return script
