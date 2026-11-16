"""A web page (an .html file) a terminal made on the cluster, opened in this computer's browser: the page and the
files it uses from its own folder (styles, scripts, pictures) come here, to the folder the app opens downloads in."""

import base64
import hashlib
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


SEARCH_DEPTH = 6  # folders below the session's where a relative page may be (an agent's worktree, say)
SEARCH_SECONDS = 10


def where(path: str, cwd: str = "", session: str = "") -> str:
    """Shell line printing the page's full path: a relative one is read from the session's folder (tmux's), or cwd.
    Not there, a relative one is looked for below it: an agent names files from its own folder (a worktree under
    the project, for one), which isn't always the session's."""
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
    if not go:
        return f"{go}realpath -e -- {target}"
    pattern = shlex.quote("*/" + re.sub(r"([][*?\\])", r"\\\1", path.removeprefix("./")))
    search = (f"timeout {SEARCH_SECONDS} find . -maxdepth {SEARCH_DEPTH} -path {pattern} -type f -print 2>/dev/null"
              " | head -n 1")
    return (f"{go}realpath -e -- {target} 2>/dev/null || {{ f=$({search}); "
            f'[ -n "$f" ] && realpath -e -- "$f" || {{ echo {shlex.quote("No such file: " + path)} >&2; exit 1; }}; }}')


def pack(folder: str, names: list[str]) -> str:
    """Shell line: the files (relative to folder) that are there, as a tar in base64. Missing ones are left out."""
    files = " ".join(shlex.quote(n) for n in names)
    return (f"cd -- {shlex.quote(folder)} && for f in {files}; do [ -f \"$f\" ] && printf '%s\\0' \"$f\"; done "
            f"| tar --null -T - -cf - | head -c {MAX_PAGE + 1} | base64 -w0")


def references(text: str, of: str = "") -> list[str]:
    """Files in the page's folder (or below) that a page or style sheet uses, as paths from that folder; of is the
    file's own path in it (a style sheet in css/ says url(../img/a.png)). Web addresses and outside files are not."""
    here = posixpath.dirname(of)
    out: list[str] = []
    for m in REF_RE.finditer(text):
        ref = m.group(1).strip()
        if not ref or re.match(r"^[a-z][a-z0-9+.-]*:", ref, re.I) or ref.startswith(("/", "\\")):
            continue
        norm = posixpath.normpath(posixpath.join(here, ref))
        if norm.startswith("..") or norm in (".", "") or norm in out:
            continue
        out.append(norm)
    return out


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


def _readable(name: str) -> bool:
    return name.lower().endswith((".html", ".htm", ".css", ".svg"))  # what can name more files


def fetch(run: Callable[[str], str], path: str, local_dir: str, session: str = "", cwd: str = "") -> Path:
    """Brings the page here with what it uses from its folder: its pictures and styles, the other pages it links to
    and what those use in turn (up to MAX_FILES and MAX_PAGE). They land in local_dir/<folder name>-<tag>/, the tag
    telling apart folders of the same name; answers the page's local path.
    run: runs a shell line where the terminal runs and answers its output (raises if it fails)."""
    full = run(where(path, cwd, session)).strip().splitlines()
    if not full or not full[-1].startswith("/"):
        raise PageError(f"Could not find {path}")
    full_path = full[-1]
    folder, name = posixpath.split(full_path)
    tag = hashlib.sha1(folder.encode()).hexdigest()[:6]
    into = Path(local_dir) / f"{posixpath.basename(folder) or 'page'}-{tag}"
    into.mkdir(parents=True, exist_ok=True)
    got = unpack(run(pack(folder, [name])), into)
    if name not in got:
        raise PageError(f"Could not read {full_path}")
    asked = {name}
    while got:
        todo = []
        for f in got:
            if not _readable(f):
                continue
            for ref in references((into / f).read_text(errors="replace"), of=f):
                if ref not in asked and len(asked) < MAX_FILES:
                    asked.add(ref)
                    todo.append(ref)
        if not todo or sum(p.stat().st_size for p in into.rglob("*") if p.is_file()) > MAX_PAGE:
            break
        got = unpack(run(pack(folder, todo)), into)
    return into / name
