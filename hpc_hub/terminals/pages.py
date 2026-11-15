"""A web page (an .html file) a terminal made on the cluster, opened in this computer's browser: the page and the
files it uses from its own folder (styles, scripts, pictures) come here, to the folder the app opens downloads in."""

import base64
import io
import posixpath
import re
import shlex
import tarfile
from collections.abc import Callable
from pathlib import Path

MAX_PAGE = 20 * 1024 * 1024  # all of it, page and its files
MAX_FILES = 300
# src="x", href='x', url(x) in the page; the rest of the address (?v=2, #top) is not part of the file
REF_RE = re.compile(r"""(?:\b(?:src|href|poster|data)\s*=\s*["']|url\(\s*["']?)([^"'()\s?#]+)""", re.I)


class PageError(Exception):
    pass


def where(path: str, cwd: str = "", session: str = "") -> str:
    """Shell line printing the page's full path: a relative one is read from the session's folder (tmux's), or cwd."""
    if path.startswith("~/"):
        target = '"$HOME"/' + shlex.quote(path[2:])
    else:
        target = shlex.quote(path)
    go = ""
    if not path.startswith(("/", "~/")):
        if session:
            here = f"tmux display -p -t {shlex.quote('=' + session + ':')} '#{{pane_current_path}}' 2>/dev/null"
            go = f'd=$({here}); [ -n "$d" ] && cd -- "$d" 2>/dev/null; '
        elif cwd:
            go = f"cd -- {shlex.quote(cwd)} 2>/dev/null; "
    return f"{go}realpath -e -- {target}"


def pack(folder: str, names: list[str]) -> str:
    """Shell line: the files (relative to folder) that are there, as a tar in base64. Missing ones are left out."""
    files = " ".join(shlex.quote(n) for n in names)
    return (f"cd -- {shlex.quote(folder)} && for f in {files}; do [ -f \"$f\" ] && printf '%s\\0' \"$f\"; done "
            f"| tar --null -T - -cf - | head -c {MAX_PAGE + 1} | base64 -w0")


def references(html: str) -> list[str]:
    """Files in the page's folder (or below) that the page uses; web addresses and outside files are not."""
    out: list[str] = []
    for m in REF_RE.finditer(html):
        ref = m.group(1).strip()
        if not ref or re.match(r"^[a-z][a-z0-9+.-]*:", ref, re.I) or ref.startswith(("/", "\\")):
            continue
        norm = posixpath.normpath(ref)
        if norm.startswith("..") or norm in (".", "") or norm in out:
            continue
        out.append(norm)
    return out[:MAX_FILES]


def unpack(data: str, into: Path) -> list[str]:
    """Puts a base64 tar from pack() in the folder; only plain files that stay inside it. Their names."""
    raw = base64.b64decode(data or "")
    if len(raw) > MAX_PAGE:
        raise PageError(f"The page and its files are over {MAX_PAGE // 1024 // 1024} MB")
    if not raw:
        return []
    got = []
    root = into.resolve()
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        for member in tar.getmembers():
            dest = (into / member.name).resolve()
            if not member.isfile() or not dest.is_relative_to(root):
                continue
            src = tar.extractfile(member)
            if src is None:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(src.read())
            got.append(member.name)
    return got


def fetch(run: Callable[[str], str], path: str, local_dir: str, session: str = "", cwd: str = "") -> Path:
    """Brings the page and its files to local_dir/<the page's folder name>/ and answers the page's local path.
    run: runs a shell line where the terminal runs and answers its output (raises if it fails)."""
    full = run(where(path, cwd, session)).strip().splitlines()
    if not full or not full[-1].startswith("/"):
        raise PageError(f"Could not find {path}")
    full_path = full[-1]
    folder, name = posixpath.split(full_path)
    into = Path(local_dir) / (posixpath.basename(folder) or "page")
    into.mkdir(parents=True, exist_ok=True)
    if name not in unpack(run(pack(folder, [name])), into):
        raise PageError(f"Could not read {full_path}")
    page = into / name
    refs = [r for r in references(page.read_text(errors="replace")) if r != name]
    if refs:
        unpack(run(pack(folder, refs)), into)
    return page
