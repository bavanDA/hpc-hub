"""Upload and download between this computer and a cluster, with scp over the open connection. They show in
the same transfer list as the copies of files_copy.py."""

import os
import posixpath
import shutil
import subprocess
import time
from pathlib import Path

from ...files import remote_fs, transfer
from ...files.status import size_text
from ..hub import hub
from ..server import method
from .files_copy import Transfer, emit, start

POLL = 0.2
LOCAL_EVERY = 0.5  # seconds between reads of a download's size on disk
REMOTE_EVERY = 2.0  # seconds between asks for an upload's size on the cluster
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


def _scp(t: Transfer, argv: list[str], measure, every: float, base: int = 0) -> None:
    """Run one scp; meanwhile done = base + measure(), every few seconds."""
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
            emit(t)
    err = proc.stderr.read() if proc.stderr else ""
    if proc.returncode:
        raise remote_fs.FsError(err.strip() or "Copy failed")


@method("files.upload")
def upload(cluster: str, local_paths: list[str], remote_dir: str) -> dict:
    """Copy files or folders from this computer into remote_dir; answers the transfer's id."""
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

    def work(t: Transfer) -> None:
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
        t.status = f"Done · {size_text(p.total)}"

    return {"id": start(f"{what}: {HERE} → {s.cfg.short_name}:{remote_dir}", "laptop", work).id}


@method("files.download")
def download(cluster: str, remote_path: str, local_dir: str) -> dict:
    """Copy a file or folder into local_dir (made if needed) under a free name; answers the transfer's id and
    where it lands."""
    s = hub().connected(cluster)
    folder = Path(local_dir).expanduser()
    folder.mkdir(parents=True, exist_ok=True)
    name = posixpath.basename(remote_path.rstrip("/"))
    if not name:
        raise ValueError("Pick a file or folder to download")
    target = free_name(folder, name)
    ssh = s.ssh

    def work(t: Transfer) -> None:
        t.progress.total = transfer.total_size(ssh, remote_path)
        t.status = ""
        emit(t)
        try:
            _scp(t, ssh.copy_argv(":" + remote_path, str(target)), lambda: local_size(target), LOCAL_EVERY)
        except Exception:
            if t.progress.cancelled.is_set():  # no half files left behind
                _remove(target)
            raise
        t.progress.done = local_size(target)
        t.status = f"Done · {size_text(t.progress.done)} · {target}"

    t = start(f"{name}: {s.cfg.short_name} → {HERE}", "laptop", work)
    return {"id": t.id, "path": str(target)}
