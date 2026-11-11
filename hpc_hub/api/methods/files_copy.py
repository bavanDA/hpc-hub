"""Copies of the Files page: on one cluster, between clusters through this laptop or with Globus. Each is a
Transfer in one list, reported as `transfer` events."""

import posixpath
import secrets
import subprocess
import threading
import time
from dataclasses import dataclass, field
from functools import partial

from ...core import config
from ...files import remote_fs, transfer
from ...files.status import size_text, task_line
from ...globus import api as globus
from ..hub import hub
from ..server import method

GLOBUS_POLL = 3.0
UPDATE_EVERY = 0.3


@dataclass
class Transfer:
    id: str
    title: str
    how: str  # laptop, globus, cluster (both ends on one cluster)
    status: str = "Starting…"
    task: str = ""  # Globus task id
    progress: transfer.Progress = field(default_factory=transfer.Progress)

    def json(self) -> dict:
        p = self.progress
        return {"id": self.id, "title": self.title, "how": self.how, "done": p.done, "total": p.total,
                "status": self.status, "finished": p.finished, "error": p.error}


_transfers: dict[str, Transfer] = {}
_lock = threading.Lock()
_resumed = False


def emit(t: Transfer) -> None:
    hub().emit("transfer", t.json())


def start(title: str, how: str, work, task: str = "", status: str = "Starting…") -> Transfer:
    """Add a transfer to the list and run work(t) in a thread; a raised error ends up on its row."""
    t = Transfer(secrets.token_hex(6), title, how, status=status, task=task)
    with _lock:
        _transfers[t.id] = t
    emit(t)
    threading.Thread(target=_run, args=(t, work), daemon=True, name=f"copy-{t.id}").start()
    return t


def _run(t: Transfer, work) -> None:
    try:
        work(t)
    except Exception as e:  # noqa: BLE001 - shows on the transfer's row
        t.progress.error = t.progress.error or str(e) or type(e).__name__
        t.status = "Cancelled" if t.progress.cancelled.is_set() else f"Failed: {t.progress.error}"
    t.progress.finished = True
    emit(t)


def _signed_in_globus() -> globus.Globus | None:
    cid = config.load_app().globus_client_id
    client = globus.Globus(cid) if cid else None
    return client if client and client.logged_in else None


def _globus_client() -> globus.Globus:
    client = _signed_in_globus()
    if not client:
        raise RuntimeError("Sign in to Globus first, on the Globus page")
    return client


def _resume_globus() -> None:
    """Once a run: follow the Globus copies still running from before the app was closed."""
    global _resumed
    if _resumed:
        return
    _resumed = True
    client = _signed_in_globus()
    if not client:
        return
    try:
        tasks = client.tasks(10)
    except globus.GlobusError:
        return
    for task in reversed(tasks):
        if task.get("status") not in ("ACTIVE", "INACTIVE"):
            continue
        with _lock:
            if any(x.task == task["task_id"] for x in _transfers.values()):
                continue
        start(f"{task.get('label') or task['task_id']} · Globus", "globus", partial(_watch, client=client),
              task=task["task_id"], status="Asking Globus…")


@method("files.copy_plan")
def copy_plan(cluster: str, path: str) -> dict:
    """What is inside a folder and how big, so big parts can stay behind."""
    sizes = transfer.subfolder_sizes(hub().connected(cluster).ssh, path)
    return {"sizes": [{"name": n, "size": s} for n, s in sizes], "total": sum(s for _, s in sizes)}


@method("files.transfers")
def transfers() -> list[dict]:
    """Newest first."""
    _resume_globus()
    with _lock:
        return [t.json() for t in reversed(_transfers.values())]


@method("files.copy")
def copy(src_cluster: str, src_path: str, dst_cluster: str, dst_dir: str, skip: list[str] | None = None,
         how: str = "laptop", folder: bool = True, total: int = 0) -> dict:
    """Start a copy of src_path into dst_dir; answers its id."""
    h = hub()
    src, dst = h.session(src_cluster), h.session(dst_cluster)
    name = posixpath.basename(src_path.rstrip("/"))
    title = f"{name}: {src.cfg.short_name} → {dst.cfg.short_name}:{dst_dir}"
    if src_cluster == dst_cluster:
        how = "cluster"
        work = partial(_on_cluster, ssh=h.connected(src_cluster).ssh, src_path=src_path, dst_dir=dst_dir)
    elif how == "globus":
        for c in (src, dst):
            if not c.cfg.globus.collection_id:
                raise RuntimeError(f"Pick the Globus collection of {c.cfg.name} on the Globus page first")
        title += " · Globus"
        work = partial(_globus, client=_globus_client(), a=src.cfg.globus.collection_id, src_path=src_path,
                       b=dst.cfg.globus.collection_id, dst_path=posixpath.join(dst_dir, name),
                       label=f"{name} to {dst.cfg.name}", folder=folder, skip=skip)
    else:
        work = partial(_laptop, src=h.connected(src_cluster).ssh, src_path=src_path,
                       dst=h.connected(dst_cluster).ssh, dst_dir=dst_dir, skip=skip, total=total)
    return {"id": start(title, how, work).id}


def _cp_command(src_path: str, dst_dir: str) -> str:
    """Prints the process id first, so a cancel can stop it. With rsync, copying again picks up where it stopped."""
    src, dst = remote_fs.q(src_path.rstrip("/")), remote_fs.q(dst_dir.rstrip("/") + "/")
    return (f"if command -v rsync >/dev/null; then rsync -rlt --partial -- {src} {dst} & "
            f"else cp -r -- {src} {dst} & fi; echo $!; wait $!")


def _on_cluster(t: Transfer, ssh, src_path: str, dst_dir: str) -> None:
    t.status = "Copying on the cluster…"
    emit(t)
    proc = ssh.popen(_cp_command(src_path, dst_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pid = (proc.stdout.readline() or "").strip()
    while proc.poll() is None:
        if t.progress.cancelled.is_set() and pid.isdigit():
            ssh.on_login(f"kill {int(pid)}", timeout=30)
            proc.wait(timeout=30)
            raise RuntimeError("Cancelled")
        time.sleep(0.5)
    if proc.returncode != 0:
        err = proc.stderr.read().strip()
        raise RuntimeError(err.splitlines()[-1] if err else "Copy failed")
    t.status = "Done"


def _laptop(t: Transfer, src, src_path: str, dst, dst_dir: str, skip, total: int) -> None:
    last = 0.0

    def update(p: transfer.Progress) -> None:
        nonlocal last
        now = time.monotonic()
        if not p.finished and now - last > UPDATE_EVERY:
            last = now
            t.status = ""  # the UI shows "x of y"
            emit(t)
    transfer.copy(src, src_path, dst, dst_dir, t.progress, update, skip, total)
    t.status = f"Done · {size_text(t.progress.done)}"


def _globus(t: Transfer, client: globus.Globus, a: str, src_path: str, b: str, dst_path: str, label: str,
            folder: bool, skip) -> None:
    t.status = "Sending to Globus…"
    emit(t)
    t.task = client.submit(a, client.path_for(a, src_path), b, client.path_for(b, dst_path), label, folder,
                           sync_level=2, skip=skip)
    if t.progress.cancelled.is_set():  # cancelled while it was being sent
        client.cancel(t.task)
    _watch(t, client)


def _watch(t: Transfer, client: globus.Globus) -> None:
    p = t.progress
    while True:
        try:
            info = client.task(t.task)
        except globus.GlobusError as e:
            t.status = f"Globus: {e}"
        else:
            p.done, p.total = info.files_done, info.files
            if info.finished:
                p.error = "" if info.status == "SUCCEEDED" else "Cancelled" if info.cancelled else "Failed"
                t.status = task_line(info)
                return
            t.status = "Cancelling…" if p.cancelled.is_set() else task_line(info)
        emit(t)
        time.sleep(GLOBUS_POLL)


@method("files.cancel_transfer")
def cancel_transfer(id: str) -> None:
    """Stops a running copy; a finished one leaves the list."""
    with _lock:
        t = _transfers.get(id)
        if t and t.progress.finished:
            del _transfers[id]
            return
    if not t or t.progress.cancelled.is_set():
        return
    t.progress.cancelled.set()
    t.status = "Cancelling…"
    emit(t)
    if t.how == "globus" and t.task:
        try:
            _globus_client().cancel(t.task)
        except Exception:
            t.progress.cancelled.clear()
            raise
