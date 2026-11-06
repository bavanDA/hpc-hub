"""Copy or sync a project and its Claude chats to another cluster, through this laptop or with Globus, or into
another group's folder on the same cluster. Copies report `transfer` events."""

import posixpath
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from ...agents import chat_copy
from ...agents import chats as chat_list
from ...core import config
from ...files import remote_fs, transfer
from ...files.status import size_text, task_line
from ...globus import api as globus
from ..hub import hub
from ..server import method
from .projects import _find, _load, _lock, _save

GLOBUS_POLL = 3
GLOBUS_TRIES = 20  # Globus errors in a row before we stop asking
CHAT_LIMIT = 400
REPORT_EVERY = 0.3

_running: dict[str, transfer.Progress] = {}  # by transfer id


def _globus_client() -> globus.Globus | None:
    cid = config.load_app(config.APP_FILE).globus_client_id
    return globus.Globus(cid) if cid else None


def _globus_missing(src: config.ClusterConfig, dst: config.ClusterConfig) -> str:
    client = _globus_client()
    missing = [] if client else ["your Globus app id"]
    if client and not client.logged_in:
        missing.append("signing in")
    missing += [f"a Globus collection for {c.name}" for c in (src, dst) if not c.globus.collection_id]
    return ", ".join(missing)


@method("projects.copy_targets")
def copy_targets(id: str) -> dict:
    """Clusters it can go to and what Globus still needs for each. Its own cluster comes first (same: true), for a
    copy into another group's folder there."""
    p = _find(_load(), id)
    src = hub().session(p.cluster)
    others = [s for s in hub().sessions.values() if s is not src]
    return {"name": posixpath.basename(p.path.rstrip("/")), "copy_to": p.copy_to, "copy_into": p.copy_into,
            "targets": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected, "same": s is src,
                         "globus_missing": "" if s is src else _globus_missing(src.cfg, s.cfg)}
                        for s in [src, *others]]}


def _project_chats(ssh, path: str) -> list[chat_list.Chat]:
    """Claude chats started in the folder or below it; /scratch may be a link to /mmfs1/scratch."""
    real = ssh.run(f"readlink -f {remote_fs.q(path)}", timeout=30).stdout.strip().rstrip("/")
    roots = {path.rstrip("/"), real} - {""}
    return [c for c in chat_list.list_chats(ssh, "claude", CHAT_LIMIT, full_size=True)
            if any(c.cwd == r or c.cwd.startswith(r + "/") for r in roots)]


def _error(e: Exception) -> str:
    return str(e) or type(e).__name__


@method("projects.copy_plan")
def copy_plan(id: str) -> dict:
    """What is in the project (biggest first) and its Claude chats, so some can stay behind."""
    p = _find(_load(), id)
    s = hub().connected(p.cluster)
    with ThreadPoolExecutor(2) as pool:
        sizes = pool.submit(transfer.subfolder_sizes, s.ssh, p.path)
        found = pool.submit(_project_chats, s.ssh, p.path)
    out: dict = {"parts": [], "chats": [], "parts_error": "", "chats_error": ""}
    try:
        out["parts"] = [{"name": n, "size": size, "keep": n != ".claude"} for n, size in sizes.result()]
    except Exception as e:  # noqa: BLE001 - shown in the dialog
        out["parts_error"] = _error(e)
    try:
        out["chats"] = [{"id": c.id, "name": c.name, "size": c.size} for c in found.result()]
    except Exception as e:  # noqa: BLE001 - shown in the dialog
        out["chats_error"] = _error(e)
    return out


class _Report:
    """Sends a copy's `transfer` events; now=False sends at most a few a second."""

    def __init__(self, tid: str, title: str, p: transfer.Progress):
        self.tid, self.title, self.p, self.last = tid, title, p, 0.0

    def __call__(self, status: str, error: str = "", now: bool = True) -> None:
        t = time.monotonic()
        if not now and t - self.last < REPORT_EVERY:
            return
        self.last = t
        hub().emit("transfer", {"id": self.tid, "title": self.title, "done": self.p.done, "total": self.p.total,
                                "status": status, "finished": self.p.finished, "error": error})


def _start(title: str, work) -> str:
    tid = "project-" + secrets.token_hex(6)
    p = transfer.Progress()
    _running[tid] = p
    report = _Report(tid, title, p)
    report("Starting")

    def run():
        try:
            work(p, report)
        except Exception as e:  # noqa: BLE001 - the UI shows it
            p.finished = True
            msg = "Cancelled" if p.cancelled.is_set() else _error(e)
            report(msg if msg == "Cancelled" else f"Failed: {msg}", error=msg)
        finally:
            _running.pop(tid, None)
    threading.Thread(target=run, daemon=True, name=tid).start()
    return tid


def _copying(report: _Report):
    return lambda pr: pr.finished or report("Copying", now=False)


def _laptop(src, path: str, dst, parent: str, skip: list[str], size: int):
    def work(p: transfer.Progress, report: _Report):
        transfer.copy(src.ssh, path, dst.ssh, parent, p, _copying(report), skip, size)
        report(f"Done · {size_text(p.done)}")
    return work


def _here(s, path: str, parent: str, skip: list[str], size: int, job: str):
    def work(p: transfer.Progress, report: _Report):
        transfer.copy_here(s.ssh, path, parent, p, _copying(report), skip, size, job)
        report(f"Done · {size_text(p.done)}")
    return work


def _globus(client: globus.Globus, src: config.ClusterConfig, path: str, dst: config.ClusterConfig, dest: str,
            skip: list[str]):
    def work(p: transfer.Progress, report: _Report):
        report("Sending to Globus")
        a, b = src.globus.collection_id, dst.globus.collection_id
        task = client.submit(a, client.path_for(a, path), b, client.path_for(b, dest),
                             f"{posixpath.basename(path.rstrip('/'))} to {dst.name}", True, sync_level=2, skip=skip)
        asked, fails = False, 0
        while not p.finished:
            if p.cancelled.is_set() and not asked:
                asked = True
                client.cancel(task)
            try:
                info = client.task(task)
            except Exception as e:  # noqa: BLE001 - Globus hiccups; keep asking a while
                fails += 1
                if fails >= GLOBUS_TRIES:
                    raise
                report(f"Globus: {e}")
            else:
                fails = 0
                p.done, p.total, p.finished = info.files_done, info.files, info.finished
                line = "Cancelling" if asked and not p.finished else task_line(info)
                report(line, error=line if info.status == "FAILED" else "")
            if not p.finished:
                p.cancelled.wait(GLOBUS_POLL)  # wakes at once on cancel
    return work


def _chats(src, picked: list[str], dst, dest: str):
    def work(p: transfer.Progress, report: _Report):
        found = [c for c in chat_list.list_chats(src.ssh, "claude", CHAT_LIMIT, full_size=True) if c.id in picked]
        p.total = sum(c.size for c in found)
        for c in found:
            part = transfer.Progress(cancelled=p.cancelled)
            base = p.done

            def update(pr, base=base):
                p.done = base + pr.done
                report("Copying", now=False)
            chat_copy.copy(src.ssh, c, dst.ssh, dest, part, update)
            p.done = base + part.done
        p.finished = True
        report(f"Copied {len(found)} chats. Continue them from Claude on {dst.cfg.name}")
    return work


def _same_cluster_work(src, path: str, parent: str, skip: list[str], size: int):
    """rsync on the cluster into another group's folder, on your compute node."""
    real = src.ssh.run(f"readlink -f {remote_fs.q(path)} {remote_fs.q(parent)}", timeout=30).stdout.split()
    here, there = real if len(real) == 2 else (path, parent)
    if there == here or there.startswith(here.rstrip("/") + "/"):
        raise ValueError("Pick a folder outside the project")
    if posixpath.dirname(here.rstrip("/")) == there.rstrip("/"):
        raise ValueError("That is where it is now. Pick another folder")
    alloc = getattr(src, "allocation", None)
    if not alloc:  # real work never runs on the login node
        raise RuntimeError(f"The copy runs on a compute node. Get one on {src.cfg.short_name} first")
    return _here(src, path, parent, skip, size, alloc.job_id)


@method("projects.copy")
def copy(id: str, to: str, into: str = "~", how: str = "laptop", skip: list[str] | None = None,
         chats: list[str] | None = None, size: int = 0) -> dict:
    """Start copying (laptop), syncing (globus) or, on the same cluster, rsyncing the project into a folder, leaving
    out skip (names directly inside it), plus the picked Claude chats. Answers the transfer ids at once."""
    into = into.strip() or "~"
    skip = skip or []
    with _lock:
        items = _load()
        p = _find(items, id)
        src, dst = hub().connected(p.cluster), hub().connected(to)
        how = "here" if src is dst else how
        client = None
        if how == "globus":
            if missing := _globus_missing(src.cfg, dst.cfg):
                raise RuntimeError(f"Globus needs {missing}. Set it up on the Globus page")
            client = _globus_client()
        p.copy_to, p.copy_into = to, into
        _save(items)
    parent = remote_fs.expand(dst.ssh, into).rstrip("/") or "/"
    dest = posixpath.join(parent, posixpath.basename(p.path.rstrip("/")))
    title = f"{p.name}: {src.cfg.short_name} → {dst.cfg.short_name}:{dest}"
    if how == "here":
        files = _start(f"{p.name} → {dest}", _same_cluster_work(src, p.path, parent, skip, size))
    elif client:
        files = _start(f"{title} · Globus", _globus(client, src.cfg, p.path, dst.cfg, dest, skip))
    else:
        files = _start(title, _laptop(src, p.path, dst, parent, skip, size))
    talk = _start(f"{len(chats)} Claude chats of {p.name} → {dst.cfg.short_name}",
                  _chats(src, chats, dst, dest)) if chats else ""
    return {"id": files, "chats": talk}


@method("projects.cancel_copy")
def cancel_copy(id: str) -> None:
    p = _running.get(id)
    if p:
        p.cancelled.set()
