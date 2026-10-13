"""Copy files between clusters directly: tar | ssh | tar, streamed through the laptop."""

import posixpath
import shlex
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass, field

from .ssh import SshMaster

CHUNK = 1024 * 1024


class TransferError(Exception):
    pass


@dataclass
class Progress:
    done: int = 0
    total: int = 0
    finished: bool = False
    error: str = ""
    cancelled: threading.Event = field(default_factory=threading.Event)

    @property
    def fraction(self) -> float:
        return min(1.0, self.done / self.total) if self.total else 0.0


def total_size(ssh: SshMaster, path: str) -> int:
    res = ssh.run(f"du -sb -- {shlex.quote(path)} 2>/dev/null | cut -f1", timeout=300)
    try:
        return int(res.stdout.strip() or 0)
    except ValueError:
        return 0


def pack_command(src: str) -> str:
    parent, name = posixpath.split(src.rstrip("/"))
    return f"tar cf - -C {shlex.quote(parent or '/')} -- {shlex.quote(name)}"


def unpack_command(dest_dir: str) -> str:
    return f"mkdir -p -- {shlex.quote(dest_dir)} && tar xf - -C {shlex.quote(dest_dir)}"


def copy(src_ssh: SshMaster, src: str, dst_ssh: SshMaster, dest_dir: str, progress: Progress,
         on_update: Callable[[Progress], None] = lambda p: None) -> None:
    """Blocking. Copies src (file or folder) into dest_dir on the other cluster."""
    progress.total = total_size(src_ssh, src)
    reader = subprocess.Popen(src_ssh.argv(pack_command(src)), stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    writer = subprocess.Popen(dst_ssh.argv(unpack_command(dest_dir)), stdin=subprocess.PIPE,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        while chunk := reader.stdout.read(CHUNK):
            if progress.cancelled.is_set():
                raise TransferError("Cancelled")
            writer.stdin.write(chunk)
            progress.done += len(chunk)
            on_update(progress)
        writer.stdin.close()
        if reader.wait() != 0:
            raise TransferError(reader.stderr.read().decode(errors="replace").strip() or "Reading source failed")
        if writer.wait() != 0:
            raise TransferError(writer.stderr.read().decode(errors="replace").strip() or "Writing destination failed")
    except (TransferError, OSError) as e:
        for p in (reader, writer):
            if p.poll() is None:
                p.kill()
        progress.error = str(e) if not isinstance(e, BrokenPipeError) else "Destination closed the connection"
        raise TransferError(progress.error) from e
    finally:
        progress.finished = True
        on_update(progress)
