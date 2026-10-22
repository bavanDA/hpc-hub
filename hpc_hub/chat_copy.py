"""Copy a Claude chat to another cluster to continue it there: the conversation, its subagents and saved tool
output, and its edit history. Paths under the chat's old folder are changed to point to the new one."""

import posixpath
import re
import shlex
import subprocess
from collections.abc import Callable

from . import remote_fs, transfer
from .chats import Chat
from .ssh import SshMaster


def project_dir(folder: str) -> str:
    """Claude keeps a folder's chats in ~/.claude/projects/<the path with every other character as ->."""
    return re.sub(r"[^A-Za-z0-9]", "-", folder.rstrip("/") or "/")


def moved(data: bytes, old: str, new: str) -> bytes:
    """old folder -> new folder wherever it appears as a whole path (not /old2)."""
    old, new = old.rstrip("/"), new.rstrip("/")
    if not old or old == new:
        return data
    return re.sub(re.escape(old.encode()) + rb'(?=[/"\\\s\']|$)', new.encode(), data)


def _exists(ssh: SshMaster, path: str) -> bool:
    return ssh.run(f"test -e {shlex.quote(path)}", timeout=30).returncode == 0


def copy(src: SshMaster, chat: Chat, dst: SshMaster, dest_folder: str, progress: transfer.Progress,
         on_update: Callable[[transfer.Progress], None] = lambda p: None) -> str:
    """Blocking. Returns the folder on dst the chat now belongs to."""
    src_home, dst_home = remote_fs.home(src), remote_fs.home(dst)
    folder = remote_fs.expand(dst, dest_folder).rstrip("/")
    src_dir = posixpath.join(src_home, ".claude/projects", chat.dir or project_dir(chat.cwd))
    dst_dir = posixpath.join(dst_home, ".claude/projects", project_dir(folder))
    progress.total = progress.total or chat.size

    got = subprocess.run(src.argv(f"cat {shlex.quote(f'{src_dir}/{chat.id}.jsonl')}"), capture_output=True,
                         timeout=600)
    if got.returncode != 0:
        raise transfer.TransferError(got.stderr.decode(errors="replace").strip() or "Could not read the chat")
    data = moved(got.stdout, chat.cwd, folder)
    target = shlex.quote(f"{dst_dir}/{chat.id}.jsonl")
    put = subprocess.run(dst.argv(f"mkdir -p {shlex.quote(dst_dir)} && cat > {target}.new && mv {target}.new "
                                  f"{target}"), input=data, capture_output=True, timeout=600)
    if put.returncode != 0:
        raise transfer.TransferError(put.stderr.decode(errors="replace").strip() or "Could not write the chat")
    progress.done += len(got.stdout)
    on_update(progress)

    extras = [(f"{src_dir}/{chat.id}", dst_dir),  # subagents and saved tool output
              (f"{src_home}/.claude/file-history/{chat.id}", f"{dst_home}/.claude/file-history")]
    for path, into in extras:
        if not _exists(src, path):
            continue
        part = transfer.Progress(cancelled=progress.cancelled)
        base = progress.done

        def update(p, base=base):
            progress.done = base + p.done
            on_update(progress)
        transfer.copy(src, path, dst, into, part, update)
    return folder
