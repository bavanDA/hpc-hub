"""Open and save text files on a cluster without losing anything (docs/design/code.md):

- open answers the text plus the file's sha256, so a save can check nobody changed it meanwhile (an agent, a job,
  you in a terminal). Bytes that aren't UTF-8 open read-only, so saving can't damage them.
- save is compare and swap: it writes only if the file still has the sha it was opened with, through links, keeping
  the file's mode (remote_fs.REPLACE_SH) and its line endings.
- stat tells which open files changed; find_files and grep search a folder.

Each call is one command on the cluster. The cluster is Linux: GNU stat, sha256sum, find and grep (rg if there).
"""

import base64
import hashlib
import re
import sys
from dataclasses import dataclass

from ..core.ssh import SshMaster
from ..files import remote_fs
from ..files.remote_fs import FsError, q

MB = 1024 * 1024
LIMIT = 2 * MB if sys.platform == "android" else 8 * MB  # bigger files open read-only, showing their end
MAX_FOUND = 5000
SKIP_DIRS = (".git", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache",
             ".ipynb_checkpoints", ".tox", "build", "dist")

SHA = '{ sha256sum -- "$1" 2>/dev/null || shasum -a 256 -- "$1"; } | cut -d" " -f1'

# $1 path, $2 limit: "META size mtime writable sha", then the bytes (the end of a big file) as base64
OPEN_SH = rf"""
set -o pipefail
[ -e "$1" ] || {{ echo "No such file" >&2; exit 1; }}
[ -d "$1" ] && {{ echo "That's a folder" >&2; exit 1; }}
[ -r "$1" ] || {{ echo "No read permission" >&2; exit 1; }}
st=$(stat -L -c '%s %Y' -- "$1") || exit 1
set -- "$1" "$2" $st
w=0; [ -w "$1" ] && w=1
echo "META $3 $4 $w $({SHA})"
if [ "$3" -gt "$2" ]; then tail -c "$2" -- "$1"; else cat -- "$1"; fi | base64 -w0
"""

# $1 path, $2 base sha ("" = a new file), $3 force (1/0); stdin is the new bytes.
# "CONFLICT sha mtime" when the file isn't what was opened, else "SAVED sha mtime".
SAVE_SH = remote_fs.REPLACE_SH + rf"""
state() {{ if [ -e "$1" ]; then echo "$({SHA}) $(stat -L -c %Y -- "$1")"; else echo "- 0"; fi; }}
if [ "$3" != 1 ]; then
  now=$(state "$1"); now=${{now%% *}}; [ "$now" = - ] && now=
  if [ "$now" != "$2" ]; then cat > /dev/null; echo "CONFLICT $(state "$1")"; exit 0; fi
fi
replace_file "$1" || exit 1
echo "SAVED $(state "$1")"
"""

# each path: "path<TAB>exists<TAB>size<TAB>mtime<TAB>sha"
STAT_SH = rf"""
for p in "$@"; do
  set -- "$p"
  if [ -f "$1" ]; then printf '%s\t1\t%s\t%s\n' "$1" "$(stat -L -c '%s	%Y' -- "$1")" "$({SHA})"
  else printf '%s\t0\t0\t0\t\n' "$1"; fi
done
"""

NEW_SH = r'set -C; [ ! -e "$1" ] || { echo "A file with that name exists" >&2; exit 1; }; cat > "$1"'


@dataclass
class Opened:
    path: str
    text: str
    sha: str
    mtime: float
    size: int
    eol: str  # lf or crlf
    writable: bool
    readonly_reason: str
    lossy: bool


@dataclass
class FileState:
    path: str
    exists: bool
    sha: str
    mtime: float
    size: int


def _mb(n: int) -> str:
    return f"{n / MB:g} MB"


def decode(data: bytes, size: int, limit: int, can_write: bool) -> tuple[str, str, bool, str]:
    """(text, eol, lossy, readonly_reason) for the bytes read; text keeps only \n (eol says what to write back)."""
    lossy, reason = False, ""
    if b"\0" in data[:8192]:
        return "", "lf", True, "Not a text file"
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        if size <= limit:
            return "", "lf", True, "Not UTF-8 text"
        text = data.decode("utf-8", "replace")  # the end of a big file may start mid character
    if size > limit:
        text = text.split("\n", 1)[1] if "\n" in text else text  # drop the cut first line
        reason = f"Bigger than {_mb(limit)}, showing the end"
    elif not can_write:
        reason = "No write permission"
    eol = "crlf" if "\r\n" in text else "lf"
    return text.replace("\r\n", "\n"), eol, lossy, reason


def encode(text: str, eol: str) -> bytes:
    text = text.replace("\r\n", "\n")
    return (text.replace("\n", "\r\n") if eol == "crlf" else text).encode("utf-8")


def open_file(ssh: SshMaster, path: str, limit: int = LIMIT) -> Opened:
    res = ssh.run(f"bash -c {q(OPEN_SH)} _ {q(path)} {int(limit)}", timeout=300, fast=True)
    if res.returncode != 0:
        err = res.stderr.strip().splitlines()
        raise FsError(err[-1] if err else "Could not open the file")
    meta, _, body = res.stdout.partition("\n")
    parts = meta.split()
    if len(parts) != 5 or parts[0] != "META":
        raise FsError("Could not open the file")
    size, mtime, can_write, sha = int(parts[1]), float(parts[2]), parts[3] == "1", parts[4]
    data = base64.b64decode(body.strip())
    if size <= limit and hashlib.sha256(data).hexdigest() != sha:
        raise FsError("The file changed while it was read. Open it again")
    text, eol, lossy, reason = decode(data, size, limit, can_write)
    return Opened(path, text, sha, mtime, size, eol, not reason and not lossy, reason, lossy)


def _state(words: list[str]) -> tuple[str, float]:
    sha = "" if words[0] == "-" else words[0]
    return sha, float(words[1])


def save(ssh: SshMaster, path: str, text: str, base_sha: str, eol: str = "lf", force: bool = False) -> dict:
    """{saved: True, sha, mtime}, or {saved: False, conflict: True, sha, mtime} (sha "" = the file is gone)."""
    out = remote_fs.pipe(ssh, SAVE_SH, [path, base_sha, "1" if force else "0"], encode(text, eol)).split()
    if len(out) != 3 or out[0] not in ("SAVED", "CONFLICT"):
        raise FsError("Could not save the file")
    sha, mtime = _state(out[1:])
    if out[0] == "CONFLICT":
        return {"saved": False, "conflict": True, "sha": sha, "mtime": mtime}
    return {"saved": True, "sha": sha, "mtime": mtime}


def stat(ssh: SshMaster, paths: list[str]) -> list[FileState]:
    if not paths:
        return []
    res = ssh.run(f"bash -c {q(STAT_SH)} _ " + " ".join(q(p) for p in paths), timeout=120, fast=True)
    out = []
    for line in res.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 5:
            p, exists, size, mtime, sha = parts
            out.append(FileState(p, exists == "1", sha, float(mtime or 0), int(size or 0)))
    return out


def new_file(ssh: SshMaster, path: str, text: str = "") -> None:
    remote_fs.pipe(ssh, NEW_SH, [path], text.encode("utf-8"))


def _glob(text: str) -> str:
    return re.sub(r"([*?\[\]\\])", r"\\\1", text)


def find_command(root: str, query: str, cap: int = MAX_FOUND) -> str:
    prune = " -o ".join(f"-name {q(d)}" for d in SKIP_DIRS)
    name = f"-iname {q('*' + _glob(query.strip()) + '*')} " if query.strip() else ""
    return (f"timeout 30 find {q(root)} -type d \\( {prune} \\) -prune -o -type f {name}-print 2>/dev/null"
            f" | head -n {int(cap)}")


def find_files(ssh: SshMaster, root: str, query: str = "", cap: int = MAX_FOUND) -> list[dict]:
    """Files under root whose name has query in it (any case), shortest names first."""
    lines = ssh.run(find_command(root, query, cap), timeout=60).stdout.splitlines()
    found = [{"path": p, "name": p.rsplit("/", 1)[-1]} for p in lines if p]
    return sorted(found, key=lambda f: (len(f["name"]), f["path"]))



