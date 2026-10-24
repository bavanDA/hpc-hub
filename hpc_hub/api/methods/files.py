"""Files on a cluster: list, read, write, zip, and copies between clusters (through this laptop or Globus)."""

import base64
import posixpath
import secrets
import threading
import time
from dataclasses import asdict, dataclass, field
from functools import partial

from ...core import config
from ...files import remote_fs, transfer
from ...globus import api as globus
from ..hub import hub
from ..server import method

TEXT_LIMIT = 512 * 1024
MEDIA_LIMIT = 60 * 1024 * 1024
MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
         ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".pdf": "application/pdf"}
GLOBUS_POLL = 3.0
UPDATE_EVERY = 0.3  # seconds between progress events of a copy through the laptop


def _ssh(cluster: str):
    return hub().connected(cluster).ssh


def size_text(n: float) -> str:
    """1.2 MB, like GLib.format_size (powers of 1000)."""
    if n < 1000:
        return f"{int(n)} bytes"
    for unit in ("kB", "MB", "GB", "TB"):
        n /= 1000
        if n < 1000 or unit == "TB":
            return f"{n:.1f} {unit}"
    return ""


@method("files.list")
def list_dir(cluster: str, path: str = "") -> dict:
    """A folder's entries; "" is home. path comes back absolute."""
    ssh = _ssh(cluster)
    target = remote_fs.expand(ssh, path.strip() or "~")
    if len(target) > 1:
        target = target.rstrip("/")
    return {"path": target, "entries": [asdict(e) for e in remote_fs.list_dir(ssh, target)]}


@method("files.places")
def places(cluster: str) -> list[dict]:
    """Home, Project and Scratch."""
    return [asdict(p) for p in remote_fs.storage(remote_fs.places(_ssh(cluster)))]


@method("files.read")
def read(cluster: str, path: str, limit: int = 0) -> dict:
    """Images and PDFs as base64 (whole, up to limit), anything else as UTF-8 text (cut at limit)."""
    ssh = _ssh(cluster)
    mime = MEDIA.get(remote_fs.ext(path), "")
    if mime:
        data = remote_fs.read_bytes(ssh, path, min(limit or MEDIA_LIMIT, remote_fs.MAX_READ))
        return {"kind": "pdf" if mime.endswith("pdf") else "image", "mime": mime, "size": len(data),
                "data": base64.b64encode(data).decode(), "cut": False}
    limit = min(limit or TEXT_LIMIT, remote_fs.MAX_READ)
    data = remote_fs.head_bytes(ssh, path, limit)
    cut = len(data) > limit
    data = data[:limit]
    if b"\0" in data:
        return {"kind": "binary", "mime": "", "size": len(data), "text": "", "cut": cut}
    return {"kind": "text", "mime": "text/plain", "size": len(data), "text": data.decode("utf-8", "replace"),
            "cut": cut}


@method("files.write")
def write(cluster: str, path: str, text: str) -> None:
    remote_fs.write_bytes(_ssh(cluster), path, text.encode())


def _name(name: str) -> str:
    name = name.strip()
    if not name or "/" in name or name in (".", ".."):
        raise ValueError("Pick a name without /")
    return name


@method("files.mkdir")
def mkdir(cluster: str, path: str, name: str) -> str:
    """New folder name inside path; returns its path."""
    target = posixpath.join(path, _name(name))
    remote_fs.mkdir(_ssh(cluster), target)
    return target


@method("files.rename")
def rename(cluster: str, path: str, name: str) -> str:
    """Rename in place (same folder); returns the new path."""
    target = posixpath.join(posixpath.dirname(path.rstrip("/")), _name(name))
    remote_fs.rename(_ssh(cluster), path, target)
    return target


@method("files.delete")
def delete(cluster: str, path: str) -> None:
    remote_fs.remove(_ssh(cluster), path)


@method("files.zip")
def make_zip(cluster: str, path: str) -> None:
    remote_fs.make_zip(_ssh(cluster), path)


@method("files.extract")
def extract(cluster: str, path: str) -> None:
    remote_fs.extract(_ssh(cluster), path)


@method("files.copy_plan")
def copy_plan(cluster: str, path: str) -> dict:
    """What is inside a folder and how big, so big parts can stay behind."""
    sizes = transfer.subfolder_sizes(_ssh(cluster), path)
    return {"sizes": [{"name": n, "size": s} for n, s in sizes], "total": sum(s for _, s in sizes)}


# -- copies --------------------------------------------------------------------------------
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


def _emit(t: Transfer) -> None:
    hub().emit("transfer", t.json())


def _globus_client() -> globus.Globus:
    cid = config.load_app().globus_client_id
    client = globus.Globus(cid) if cid else None
    if not client or not client.logged_in:
        raise RuntimeError("Sign in to Globus first, on the Globus page")
    return client


@method("files.transfers")
def transfers() -> list[dict]:
    """Copies started since the backend started, newest first."""
    with _lock:
        return [t.json() for t in reversed(_transfers.values())]


@method("files.copy")
def copy(src_cluster: str, src_path: str, dst_cluster: str, dst_dir: str, skip: list[str] | None = None,
         how: str = "laptop", folder: bool = True, total: int = 0) -> dict:
    """Start a copy of src_path into dst_dir; progress comes as `transfer` events. Returns its id."""
    h = hub()
    src, dst = h.session(src_cluster), h.session(dst_cluster)
    name = posixpath.basename(src_path.rstrip("/"))
    title = f"{name}: {src.cfg.name} → {dst.cfg.name}:{dst_dir}"
    if src_cluster == dst_cluster:
        how, run = "cluster", partial(_on_cluster, ssh=h.connected(src_cluster).ssh, src_path=src_path,
                                      dst_dir=dst_dir)
    elif how == "globus":
        a, b = src.cfg.globus.collection_id, dst.cfg.globus.collection_id
        for c, cid in ((src, a), (dst, b)):
            if not cid:
                raise RuntimeError(f"Pick the Globus collection of {c.cfg.name} on the Globus page first")
        client = _globus_client()
        title += " · Globus"
        run = partial(_globus, client=client, a=a, src_path=src_path, b=b, dst_path=posixpath.join(dst_dir, name),
                      label=f"{name} to {dst.cfg.name}", folder=folder, skip=skip)
    else:
        s, d = h.connected(src_cluster).ssh, h.connected(dst_cluster).ssh
        run = partial(_laptop, src=s, src_path=src_path, dst=d, dst_dir=dst_dir, skip=skip, total=total)
    t = Transfer(secrets.token_hex(6), title, how)
    with _lock:
        _transfers[t.id] = t
    _emit(t)
    threading.Thread(target=_run, args=(t, run), daemon=True, name=f"copy-{t.id}").start()
    return {"id": t.id}


def _run(t: Transfer, work) -> None:
    try:
        work(t)
    except Exception as e:  # noqa: BLE001 - shows on the transfer's row
        t.progress.error = t.progress.error or str(e) or type(e).__name__
        t.status = "Cancelled" if t.progress.cancelled.is_set() else f"Failed: {t.progress.error}"
    t.progress.finished = True
    _emit(t)


def _on_cluster(t: Transfer, ssh, src_path: str, dst_dir: str) -> None:
    t.status = "Copying on the cluster…"
    _emit(t)
    remote_fs.copy(ssh, src_path, dst_dir)
    t.status = "Done"


def _laptop(t: Transfer, src, src_path: str, dst, dst_dir: str, skip, total: int) -> None:
    last = [0.0]

    def update(p: transfer.Progress) -> None:
        now = time.monotonic()
        if not p.finished and now - last[0] > UPDATE_EVERY:
            last[0] = now
            t.status = ""  # the UI shows "x of y"
            _emit(t)
    transfer.copy(src, src_path, dst, dst_dir, t.progress, update, skip, total)
    t.status = f"Done · {size_text(t.progress.done)}"


def _globus(t: Transfer, client: globus.Globus, a: str, src_path: str, b: str, dst_path: str, label: str,
            folder: bool, skip) -> None:
    """Submit, then ask Globus every few seconds until it is over."""
    t.status = "Sending to Globus…"
    _emit(t)
    t.task = client.submit(a, client.path_for(a, src_path), b, client.path_for(b, dst_path), label, folder,
                           sync_level=2, skip=skip)
    p = t.progress
    if p.cancelled.is_set():  # the X was pressed while it was being sent
        client.cancel(t.task)
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
        _emit(t)
        time.sleep(GLOBUS_POLL)


def task_line(i: globus.TaskInfo) -> str:
    size = size_text(i.bytes)
    if i.status == "SUCCEEDED":
        return f"Done · {size} · {i.files} files"
    if i.cancelled:
        return "Cancelled"
    if i.status == "FAILED":
        return "Failed" + (f": {i.problem.replace('_', ' ').lower()}" if i.problem else "")
    parts = [i.problem.replace("_", " ").lower() if i.problem else "Copying" if i.files else "Counting files", size]
    if i.files:
        parts.append(f"{i.files_done} of {i.files} files")
    if i.rate:
        parts.append(f"{size_text(int(i.rate))}/s")
    return " · ".join(parts)


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
    _emit(t)
    if t.how == "globus" and t.task:
        try:
            _globus_client().cancel(t.task)
        except Exception:
            t.progress.cancelled.clear()
            raise
