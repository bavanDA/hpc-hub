"""Notes on a paper: comments and to-dos in one list. A note has text, an optional place (a line of a file, a spot
on a page of the PDF, or a commit), who wrote it (git's user name), when, and whether it is done.

They live in <git dir>/hpc-hub/notes.json: next to the paper, never committed or pushed. Every change reads the
file, changes it and writes it back under a lock, and only if nobody wrote it in between (another window, the
phone); the write goes to a temporary file that is then moved over the old one."""

import hashlib
import json
import posixpath
import secrets
import shlex
import time

from ..core.ssh import SshMaster
from ..files import remote_fs
from .history import SEP, g, parts, run

MAX_TEXT = 4000
MAX_NOTES = 2000


def _where(ssh: SshMaster, folder: str) -> tuple[str, str, str]:
    """(notes.json's path, git's user name, the repository's top)."""
    p = parts(run(ssh, f"{g(folder)} rev-parse --absolute-git-dir; echo {SEP}; {g(folder)} config user.name; "
                       f"id -un; echo {SEP}; {g(folder)} rev-parse --show-toplevel; true"), 3)
    who = [x for x in p[1].splitlines() if x.strip()]
    return posixpath.join(p[0].strip(), "hpc-hub", "notes.json"), (who[0] if who else ""), p[2].strip()


def _read(ssh: SshMaster, path: str) -> tuple[list[dict], str]:
    """The notes and the hash of the file as read ("" when there is none)."""
    res = ssh.run(f"cat {shlex.quote(path)} 2>/dev/null", timeout=30)
    raw = res.stdout if res.returncode == 0 else ""
    if not raw.strip():
        return [], ""
    try:
        notes = json.loads(raw).get("notes", [])
    except (ValueError, AttributeError):
        notes = []
    return [n for n in notes if isinstance(n, dict) and n.get("id")], hashlib.sha1(raw.encode()).hexdigest()


# replace_file under a lock, only when the file still has the hash it was read with
WRITE_SH = remote_fs.REPLACE_SH + r"""
mkdir -p -- "$(dirname -- "$1")" || exit 1
exec 9>"$1.lock"
command -v flock >/dev/null 2>&1 && flock -w 20 9
now=$( [ -f "$1" ] && sha1sum < "$1" | cut -c1-40 )
[ "$now" = "$2" ] || exit 75
replace_file "$1"
"""


def _write(ssh: SshMaster, path: str, notes: list[dict], expect: str) -> bool:
    """False when someone wrote the file since it was read."""
    data = json.dumps({"version": 1, "notes": notes}, indent=1).encode()
    try:
        remote_fs.pipe(ssh, WRITE_SH, [path, expect], data)
    except remote_fs.FsError:
        if _read(ssh, path)[1] != expect:
            return False
        raise
    return True


def load(ssh: SshMaster, folder: str) -> dict:
    """{notes, user, root}: oldest first."""
    path, user, root = _where(ssh, folder)
    return {"notes": _read(ssh, path)[0], "user": user, "root": root}


def _change(ssh: SshMaster, folder: str, fn) -> dict:
    """Read, fn(notes, user) changes them in place and answers the note it touched, write; again if it clashed."""
    path, user, _ = _where(ssh, folder)
    for _ in range(5):
        notes, expect = _read(ssh, path)
        out = fn(notes, user)
        if _write(ssh, path, notes, expect):
            return out
        time.sleep(0.2)
    raise RuntimeError("The notes kept changing while saving. Try again.")


def clean_place(place: dict | None) -> dict | None:
    """A line {path, line}, a spot on the PDF {page, x, y}, or a commit {hash}; anything else is no place."""
    if not isinstance(place, dict):
        return None
    if isinstance(place.get("path"), str) and place["path"].strip():
        p = place["path"].strip()
        if p.startswith("/") or ".." in p.split("/"):
            raise ValueError("Bad path")
        return {"path": p, "line": max(1, int(place.get("line") or 1))}
    if place.get("page"):
        return {"page": max(1, int(place["page"])), "x": float(place.get("x") or 0), "y": float(place.get("y") or 0)}
    if isinstance(place.get("hash"), str) and place["hash"].strip():
        h = place["hash"].strip()
        if not all(c in "0123456789abcdef" for c in h):
            raise ValueError("Bad commit id")
        return {"hash": h}
    return None


def _text(text: str) -> str:
    t = (text or "").strip()
    if not t:
        raise ValueError("Write something first")
    return t[:MAX_TEXT]


def add(ssh: SshMaster, folder: str, text: str, place: dict | None = None) -> dict:
    note = {"id": secrets.token_hex(4), "text": _text(text), "place": clean_place(place), "author": "",
            "time": int(time.time()), "done": False, "done_by": "", "done_at": 0}

    def fn(notes, user):
        if len(notes) >= MAX_NOTES:
            raise RuntimeError("This paper has too many notes. Remove some done ones first.")
        note["author"] = user
        note["n"] = max((int(n.get("n") or 0) for n in notes), default=0) + 1  # its pin's number
        notes.append(note)
        return note
    return _change(ssh, folder, fn)


def update(ssh: SshMaster, folder: str, note_id: str, text: str | None = None, done: bool | None = None) -> dict:
    def fn(notes, user):
        n = next((x for x in notes if x["id"] == note_id), None)
        if not n:
            raise ValueError("That note is gone")
        if text is not None:
            n["text"] = _text(text)
        if done is not None and bool(done) != bool(n.get("done")):
            n.update(done=bool(done), done_by=user if done else "", done_at=int(time.time()) if done else 0)
        return n
    return _change(ssh, folder, fn)


def remove(ssh: SshMaster, folder: str, note_id: str) -> None:
    def fn(notes, _user):
        notes[:] = [x for x in notes if x["id"] != note_id]
    _change(ssh, folder, fn)
