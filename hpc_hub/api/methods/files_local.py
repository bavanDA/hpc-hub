"""Files between this computer and a cluster: upload and download over the open connection (the scp of
remote_fs.upload and remote_fs.download, run so the X can stop it). Progress comes as `transfer` events, in the
same list as the copies of files.py."""

import os
import posixpath
import secrets
import shutil
import subprocess
import threading
import time
from pathlib import Path

from ...files import remote_fs, transfer
from ..hub import hub
from ..server import method
from . import files

POLL = 0.2  # seconds between looks at a running scp
LOCAL_EVERY = 0.5  # how often a download's size on disk is read
REMOTE_EVERY = 2.0  # how often an upload's size on the cluster is asked for
HERE = "this computer"


def local_size(path: Path) -> int:
    """Bytes of a file, or of everything in a folder (links not followed); 0 if it is not there yet."""
    if not path.is_dir() or path.is_symlink():
        try:
            return path.lstat().st_size
        except OSError:
            return 0
    total = 0
    for root, _dirs, names in os.walk(path):
        for n in names:
            try:
                total += os.lstat(os.path.join(root, n)).st_size
            except OSError:
                pass
    return total


def free_name(folder: Path, name: str) -> Path:
    """folder/name, or "name (1).ext" and so on when that is taken: a download never overwrites."""
    target, n = folder / name, 1
    stem, ext = (name, "") if name.startswith(".") and name.count(".") == 1 else os.path.splitext(name)
    while target.exists() or target.is_symlink():
        target, n = folder / f"{stem} ({n}){ext}", n + 1
    return target


def _remove(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)


def _scp(t: files.Transfer, argv: list[str], measure, every: float, base: int = 0) -> None:
    """Run one scp; meanwhile done = base + measure(). Cancelling stops it."""
    p = t.progress
    proc = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            text=True)
    last = time.monotonic()
    while True:
        try:
            proc.wait(timeout=POLL)
            break
        except subprocess.TimeoutExpired:
            pass
        if p.cancelled.is_set():
            proc.terminate()
            proc.wait()
            raise RuntimeError("Cancelled")
        if time.monotonic() - last >= every:
            last = time.monotonic()
            try:
                p.done = base + measure()
            except Exception:  # noqa: BLE001 - progress is a nicety; the copy goes on
                pass
            files._emit(t)
    err = proc.stderr.read() if proc.stderr else ""
    if proc.returncode:
        raise remote_fs.FsError(err.strip() or "Copy failed")


def _start(title: str, work) -> files.Transfer:
    t = files.Transfer(secrets.token_hex(6), title, "laptop")
    with files._lock:
        files._transfers[t.id] = t
    files._emit(t)
    threading.Thread(target=files._run, args=(t, work), daemon=True, name=f"local-{t.id}").start()
    return t


@method("files.upload")
def upload(cluster: str, local_paths: list[str], remote_dir: str) -> dict:
    """Copy files or folders from this computer into remote_dir. Returns the transfer's id."""
    s = hub().connected(cluster)
    paths = [Path(p) for p in local_paths]
    if not paths:
        raise ValueError("Pick something to upload")
    missing = next((p for p in paths if not p.exists()), None)
    if missing:
        raise FileNotFoundError(f"{missing} is not there")
    sizes = [local_size(p) for p in paths]
    what = paths[0].name if len(paths) == 1 else f"{len(paths)} items"
    ssh = s.ssh

    def work(t: files.Transfer) -> None:
        p = t.progress
        p.total = sum(sizes)
        t.status = ""
        for i, path in enumerate(paths):
            if p.cancelled.is_set():
                raise RuntimeError("Cancelled")
            target = posixpath.join(remote_dir, path.name)
            _scp(t, ssh.copy_argv(str(path), ":" + remote_dir.rstrip("/") + "/"),
                 lambda target=target: transfer.total_size(ssh, target), REMOTE_EVERY, sum(sizes[:i]))
            p.done = sum(sizes[:i + 1])
        t.status = f"Done · {files.size_text(p.total)}"

    t = _start(f"{what}: {HERE} → {s.cfg.short_name}:{remote_dir}", work)
    return {"id": t.id}


@method("files.download")
def download(cluster: str, remote_path: str, local_dir: str) -> dict:
    """Copy a file or folder into local_dir (made if needed), under a free name. Returns the transfer's id and
    where it lands."""
    s = hub().connected(cluster)
    folder = Path(local_dir).expanduser()
    folder.mkdir(parents=True, exist_ok=True)
    name = posixpath.basename(remote_path.rstrip("/"))
    if not name:
        raise ValueError("Pick a file or folder to download")
    target = free_name(folder, name)
    ssh = s.ssh

    def work(t: files.Transfer) -> None:
        t.status = "Starting…"
        t.progress.total = transfer.total_size(ssh, remote_path)
        t.status = ""
        files._emit(t)
        try:
            _scp(t, ssh.copy_argv(":" + remote_path, str(target)), lambda: local_size(target), LOCAL_EVERY)
        except Exception:
            if t.progress.cancelled.is_set():  # no half files left behind
                _remove(target)
            raise
        t.progress.done = local_size(target)
        t.status = f"Done · {files.size_text(t.progress.done)} · {target}"

    t = _start(f"{name}: {s.cfg.short_name} → {HERE}", work)
    return {"id": t.id, "path": str(target)}
