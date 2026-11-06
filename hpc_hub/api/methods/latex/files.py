import posixpath
import shlex

from ....files import remote_fs
from ....latex import build as latexmk
from ....latex import saved
from ...hub import hub
from ...server import method

EDIT_LIMIT = 8 * 1024 * 1024
CHUNK = 4 * 1024 * 1024
BUILD_OUTPUT = (".aux", ".log", ".out", ".toc", ".fls", ".fdb_latexmk", ".synctex.gz", ".bbl", ".blg", ".lof",
                ".lot", ".nav", ".snm", ".bcf", ".run.xml", ".xdv")
# "d path" / "f path" for everything in the project, minus hidden folders and LaTeX's own output
TREE = ("find . -maxdepth 6 \\( -name '.?*' -o -name _minted\\* \\) -prune -o -mindepth 1 "
        "\\( -type d -printf 'd %P\\n' -o -type f " + " ".join(f"! -name '*{e}'" for e in BUILD_OUTPUT)
        + " -printf 'f %P\\n' \\) | sort -k2 | head -3000")


def inside(folder: str, path: str) -> str:
    """path, if it is in the project folder (never the folder itself)."""
    folder, path = posixpath.normpath(folder), posixpath.normpath(path)
    if not path.startswith(folder.rstrip("/") + "/"):
        raise ValueError("That is outside the project")
    return path


def _name(name: str) -> str:
    name = name.strip()
    if not name or "/" in name or name in (".", ".."):
        raise ValueError("Pick a name without /")
    return name


def stat(ssh, path: str) -> tuple[int, str] | None:
    """(size, mtime) or None when there is no such file."""
    res = ssh.run(f"stat -L -c '%s %Y' -- {shlex.quote(path)}", timeout=30)
    parts = res.stdout.split()
    return (int(parts[0]), parts[1]) if res.returncode == 0 and len(parts) == 2 else None


@method("latex.tree")
def tree(cluster: str, folder: str) -> list[dict]:
    res = hub().connected(cluster).ssh.run(f"cd {shlex.quote(folder)} && {TREE}", timeout=60)
    if res.returncode != 0:
        raise remote_fs.FsError(res.stderr.strip() or f"Could not list {folder}")
    return [{"kind": line[0], "path": line[2:]} for line in res.stdout.splitlines()
            if len(line) > 2 and line[1] == " " and line[0] in "df"]


@method("latex.read")
def read(cluster: str, path: str) -> dict:
    data = remote_fs.read_bytes(hub().connected(cluster).ssh, path, EDIT_LIMIT)
    if b"\0" in data[:8192]:
        raise ValueError("This is not a text file")
    return {"text": data.decode("utf-8", "replace")}


@method("latex.write")
def write(cluster: str, path: str, text: str) -> None:
    ssh = hub().connected(cluster).ssh
    remote_fs.write_bytes(ssh, path, text.encode())
    saved.auto(ssh, path, "Saved")


@method("latex.new_file")
def new_file(cluster: str, folder: str, into: str, name: str) -> str:
    target = inside(folder, posixpath.join(into or folder, _name(name)))
    q = shlex.quote(target)
    if hub().connected(cluster).ssh.run(f"test ! -e {q} && : > {q}", timeout=30).returncode != 0:
        raise FileExistsError(f"{name} is there already")
    return target


@method("latex.mkdir")
def mkdir(cluster: str, folder: str, into: str, name: str) -> str:
    target = inside(folder, posixpath.join(into or folder, _name(name)))
    remote_fs.mkdir(hub().connected(cluster).ssh, target)
    return target


@method("latex.move")
def move(cluster: str, folder: str, path: str, into: str) -> str:
    """into = folder for the project's top."""
    src = inside(folder, path)
    into = posixpath.normpath(into or folder)
    if into != posixpath.normpath(folder):
        inside(folder, into)
    if into == src or into.startswith(src + "/"):
        raise ValueError("A folder can't go inside itself")
    dst = posixpath.join(into, posixpath.basename(src))
    if dst != src:
        remote_fs.rename(hub().connected(cluster).ssh, src, dst)
    return dst


@method("latex.rename")
def rename(cluster: str, folder: str, path: str, name: str) -> str:
    src = inside(folder, path)
    dst = inside(folder, posixpath.join(posixpath.dirname(src), _name(name)))
    remote_fs.rename(hub().connected(cluster).ssh, src, dst)
    return dst


@method("latex.delete")
def delete(cluster: str, folder: str, path: str) -> None:
    remote_fs.remove(hub().connected(cluster).ssh, inside(folder, path))


@method("latex.pdf")
def pdf(cluster: str, main: str) -> dict | None:
    """None before the first build."""
    path = latexmk.pdf_path(main)
    st = stat(hub().connected(cluster).ssh, path)
    return {"path": path, "size": st[0], "mtime": int(st[1])} if st else None


@method("latex.chunk")
def chunk(cluster: str, path: str, offset: int = 0, length: int = CHUNK) -> dict:
    """Part of any file as base64, so big PDFs come in pieces, and its whole size."""
    offset, length = max(0, int(offset)), max(1, min(int(length), CHUNK))
    q = shlex.quote(path)
    # head stops once it has enough, and tail may then die of SIGPIPE (141): that's fine, not a read error
    res = hub().connected(cluster).ssh.run(f"set -o pipefail; stat -L -c %s -- {q} && "
                            f"{{ tail -c +{offset + 1} -- {q} || [ $? -eq 141 ]; }} "
                            f"| head -c {length} | base64 -w0", timeout=300, fast=True)
    if res.returncode != 0:
        raise remote_fs.FsError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not read file")
    total, _, data = res.stdout.partition("\n")
    return {"data": data.strip(), "total": int(total)}
