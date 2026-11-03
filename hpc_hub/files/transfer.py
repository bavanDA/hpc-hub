"""Copy files between clusters directly: tar | ssh | tar, streamed through the laptop."""

import posixpath
import re
import shlex
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass, field

from ..core.ssh import SshMaster

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


def subfolder_sizes(ssh: SshMaster, path: str) -> list[tuple[str, int]]:
    """(name, bytes) of what is directly inside path, biggest first."""
    res = ssh.run(f"cd {shlex.quote(path)} && du -sb -- * .[!.]* 2>/dev/null", timeout=600)
    out = []
    for line in res.stdout.splitlines():
        size, _, name = line.partition("\t")
        if size.isdigit() and name:
            out.append((name, int(size)))
    return sorted(out, key=lambda x: -x[1])


def pack_command(src: str, skip: list[str] | None = None) -> str:
    """tar of src; skip: names directly inside src to leave out."""
    parent, name = posixpath.split(src.rstrip("/"))
    excludes = "".join(f" --exclude={shlex.quote('./' + name + '/' + s)}" for s in skip or [])
    return f"tar cf -{excludes} -C {shlex.quote(parent or '/')} -- {shlex.quote('./' + name)}"


def unpack_command(dest_dir: str) -> str:
    return f"mkdir -p -- {shlex.quote(dest_dir)} && tar xf - -C {shlex.quote(dest_dir)}"


def rsync_command(src: str, dest_dir: str, skip: list[str] | None = None, job: str = "") -> str:
    """rsync of src into dest_dir on the same cluster (another group's folder), reporting bytes as it goes. Files
    get the group of the folder they land in (its nearest existing one), not the one they came from, so they count
    for that group. job: run it on that job's compute node instead of the login node. The first line is the process
    id to stop, for cancel_command."""
    name = posixpath.basename(src.rstrip("/"))
    excludes = "".join(f" --exclude={shlex.quote('/' + name + '/' + s)}" for s in skip or [])
    dest = shlex.quote(dest_dir)
    where = f"srun --jobid={int(job)} --overlap --quiet " if job else "nice -n 10 "
    return (f'd={dest}; while [ ! -d "$d" ]; do d=$(dirname -- "$d"); done; g=$(stat -c %G -- "$d") && '
            f'mkdir -p -- {dest} && chgrp -- "$g" {dest} && echo PID:$$ && exec {where}'
            f'rsync -rlpt --chown=":$g" --info=progress2 --no-inc-recursive{excludes} -- '
            f"{shlex.quote(src.rstrip('/'))} {shlex.quote(dest_dir.rstrip('/') + '/')}")


def cancel_command(pid: int) -> str:
    """Stop the copy and the helpers rsync started (they would end by themselves, a little later)."""
    return f"pkill -P {int(pid)} 2>/dev/null; kill {int(pid)} 2>/dev/null; true"


PROGRESS2 = re.compile(rb"^\s*([\d,]+)\s+\d+%")


def copy_here(ssh: SshMaster, src: str, dest_dir: str, progress: Progress,
              on_update: Callable[[Progress], None] = lambda p: None, skip: list[str] | None = None,
              total: int = 0, job: str = "") -> None:
    """Blocking. Copies src into dest_dir on the same cluster with rsync on the cluster itself (nothing passes
    through the laptop), on job's compute node when there is one. Copying again only sends what changed."""
    progress.total = total or total_size(ssh, src)
    proc = subprocess.Popen(ssh.argv(rsync_command(src, dest_dir, skip, job)), stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pid, line, ended = [0], b"", threading.Event()

    def stop_when_asked():  # rsync says nothing while it lists the files: Stop can't wait for its next line
        while not ended.is_set():
            if progress.cancelled.wait(0.5):
                if pid[0]:
                    ssh.run(cancel_command(pid[0]), timeout=30)
                proc.kill()
                return
    threading.Thread(target=stop_when_asked, daemon=True).start()
    try:
        while chunk := proc.stdout.read1(4096):
            *done, line = re.split(rb"[\r\n]", line + chunk)
            for part in done:
                if part.startswith(b"PID:"):
                    pid[0] = int(part[4:])
            if m := next((PROGRESS2.match(x) for x in reversed(done) if PROGRESS2.match(x)), None):
                progress.done = int(m.group(1).replace(b",", b""))
                on_update(progress)
        if progress.cancelled.is_set():
            raise TransferError("Cancelled")
        if proc.wait() != 0:
            raise TransferError(proc.stderr.read().decode(errors="replace").strip() or "Copy failed")
        progress.done = max(progress.done, progress.total)
    except (TransferError, OSError) as e:
        if proc.poll() is None:
            proc.kill()
        progress.error = str(e)
        raise TransferError(progress.error) from e
    finally:
        ended.set()
        progress.finished = True
        on_update(progress)


def copy(src_ssh: SshMaster, src: str, dst_ssh: SshMaster, dest_dir: str, progress: Progress,
         on_update: Callable[[Progress], None] = lambda p: None, skip: list[str] | None = None,
         total: int = 0) -> None:
    """Blocking. Copies src (file or folder) into dest_dir on the other cluster, leaving out skip."""
    progress.total = total or total_size(src_ssh, src)
    reader = subprocess.Popen(src_ssh.argv(pack_command(src, skip)), stdin=subprocess.DEVNULL,
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
