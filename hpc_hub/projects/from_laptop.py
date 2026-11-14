"""A project from this computer to a cluster: its files, and the Claude chats started in it.

Reads only what you pick: the folder, and that folder's own chats in ~/.claude/projects (the folders Claude files
them under are named after the project's path, so only those are opened; no other chat is read). Nothing happens
until you start the copy."""

import io
import json
import os
import re
import tarfile
from collections.abc import Callable
from pathlib import Path

from ..agents.chat_copy import moved, project_dir
from ..agents.chats import Chat

HEAD = 262144  # bytes read from each end of a chat file for its first prompt and title


def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def _roots(folder: str) -> list[str]:
    """The folder as you picked it and with its links followed: Claude files chats under the real path."""
    picked = folder.rstrip("/\\") or folder
    return list(dict.fromkeys([picked, os.path.realpath(picked)]))


def _under(path: str, roots: list[str]) -> bool:
    return any(path == r or path.startswith(r + "/") or path.startswith(r + "\\") for r in roots)


def _text(c) -> str:
    if isinstance(c, list):
        c = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return c.strip() if isinstance(c, str) else ""


def _read(path: Path) -> Chat | None:
    """A chat file's id, folder, first prompt and title, from its first and last bytes."""
    try:
        st = path.stat()
        with path.open("rb") as f:
            head = f.read(HEAD)
            f.seek(max(0, st.st_size - HEAD))
            tail = f.read(HEAD)
    except OSError:
        return None
    cwd = first = title = custom = last = ""
    for line in head.splitlines():
        if cwd and first:
            break
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if not isinstance(d, dict):
            continue
        cwd = cwd or d.get("cwd", "")
        if d.get("type") == "user" and not d.get("isMeta") and not first:
            t = _text((d.get("message") or {}).get("content"))
            if t and not t.startswith(("<", "Caveat:")):
                first = t[:300]
    for line in tail.splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        kind = d.get("type") if isinstance(d, dict) else None
        if kind == "custom-title":
            custom = d.get("customTitle", "")
        elif kind == "ai-title":
            title = d.get("aiTitle", "")
        elif kind == "last-prompt":
            last = (d.get("lastPrompt") or "")[:300]
    if not cwd or not (first or title or custom or last):
        return None
    cid = path.name[:-6]
    size = st.st_size + _tree(path.with_suffix("")) + _tree(claude_home() / "file-history" / cid)
    return Chat(id=cid, cwd=cwd, title=custom or title, first=first, last=last, mtime=int(st.st_mtime), size=size,
                dir=path.parent.name)


def _tree(path: Path) -> int:
    """Bytes of the files under path (not following links); 0 when there is none."""
    if not path.is_dir():
        return 0
    total = 0
    for top, _, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(top, name)).st_size
            except OSError:
                pass
    return total


def chats(folder: str) -> list[Chat]:
    """The Claude chats started in folder or below it, newest first. Only the chat folders named after it are
    opened: Claude names them after the path, so a chat elsewhere is never read."""
    roots = _roots(folder)
    base = claude_home() / "projects"
    prefixes = {project_dir(r) for r in roots}
    if not base.is_dir():
        return []
    found = []
    for d in base.iterdir():
        if not d.is_dir() or not any(d.name == p or d.name.startswith(p + "-") for p in prefixes):
            continue
        for f in d.glob("*.jsonl"):
            c = _read(f)
            if c and _under(c.cwd, roots):
                found.append(c)
    return sorted(found, key=lambda c: -c.mtime)


def parts(folder: str) -> list[tuple[str, int]]:
    """(name, bytes) of what is directly inside folder, biggest first. Links count as themselves."""
    out = []
    for entry in os.scandir(folder):
        try:
            size = _tree(Path(entry.path)) if entry.is_dir(follow_symlinks=False) else entry.stat(
                follow_symlinks=False).st_size
        except OSError:
            continue
        out.append((entry.name, size))
    return sorted(out, key=lambda x: -x[1])


class _Counting(io.RawIOBase):
    """A writable stream that counts what goes through and can stop (cancel)."""

    def __init__(self, out, on_bytes: Callable[[int], None], stop: Callable[[], bool]):
        self.out, self.on_bytes, self.stop = out, on_bytes, stop

    def writable(self) -> bool:
        return True

    def write(self, b) -> int:
        if self.stop():
            raise InterruptedError("Cancelled")
        self.out.write(b)
        self.on_bytes(len(b))
        return len(b)


def pack(folder: str, out, skip: list[str], on_bytes: Callable[[int], None] = lambda n: None,
         stop: Callable[[], bool] = lambda: False) -> None:
    """A tar of folder (as one folder, its own name) into out, leaving out skip (names directly inside it).
    Links stay links. Windows paths become the cluster's forward slashes."""
    name = os.path.basename(folder.rstrip("/\\")) or "project"
    skipped = set(skip)

    def keep(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
        parts_ = info.name.split("/")
        if len(parts_) > 1 and parts_[1] in skipped:
            return None
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        return info

    with tarfile.open(fileobj=_Counting(out, on_bytes, stop), mode="w|", format=tarfile.PAX_FORMAT) as tar:
        tar.add(folder, arcname=name, recursive=True, filter=keep)


def pack_paths(paths: list[tuple[str, str]], out, on_bytes: Callable[[int], None] = lambda n: None,
               stop: Callable[[], bool] = lambda: False) -> None:
    """A tar of (local path, name in the tar) pairs: a chat's subagents and edit history."""
    with tarfile.open(fileobj=_Counting(out, on_bytes, stop), mode="w|", format=tarfile.PAX_FORMAT) as tar:
        for path, arcname in paths:
            if os.path.exists(path):
                tar.add(path, arcname=arcname, recursive=True)


def moved_from(data: bytes, old: str, new: str) -> bytes:
    """The chat with old (this computer's folder) changed to new (the cluster's) wherever it is a whole path. A
    Windows folder is written in JSON with doubled backslashes, and its subpaths take the cluster's slashes."""
    if "\\" not in old:
        return moved(data, old, new)
    escaped = old.rstrip("\\").replace("\\", "\\\\").encode()
    pattern = re.escape(escaped) + rb"((?:\\\\[^\"\\]+)*)(?=[\"\\\s']|$)"

    def swap(m: re.Match) -> bytes:
        return new.rstrip("/").encode() + m.group(1).replace(b"\\\\", b"/")
    return re.sub(pattern, swap, data)
