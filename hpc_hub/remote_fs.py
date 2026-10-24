"""Files on a cluster, through the SSH master: list, read, write, zip, copy."""

import base64
import posixpath
import shlex
import subprocess
from dataclasses import dataclass

from .ssh import SshMaster

LIST_FORMAT = r"%Y\t%s\t%T@\t%f\n"
MAX_READ = 64 * 1024 * 1024


class FsError(Exception):
    pass


@dataclass
class Entry:
    name: str
    kind: str  # d, f, l (broken link) ...
    size: int
    mtime: float

    @property
    def is_dir(self) -> bool:
        return self.kind == "d"


ARCHIVES = (".zip", ".tar.gz", ".tgz", ".tar", ".tar.bz2", ".tar.xz")


def ext(name: str) -> str:
    """Lower-case extension, keeping .tar.gz and friends whole."""
    low = name.lower()
    for multi in (".tar.gz", ".tar.bz2", ".tar.xz"):
        if low.endswith(multi):
            return multi
    return posixpath.splitext(low)[1]


def q(path: str) -> str:
    return shlex.quote(path)


def parse_listing(text: str) -> list[Entry]:
    out = []
    for line in text.splitlines():
        parts = line.split("\t", 3)
        if len(parts) != 4 or parts[3] in (".", ".."):
            continue
        kind, size, mtime, name = parts
        try:
            out.append(Entry(name, kind, int(size), float(mtime)))
        except ValueError:
            continue
    return sorted(out, key=lambda e: (not e.is_dir, e.name.lower()))


def _run(ssh: SshMaster, command: str, timeout: float = 120) -> str:
    res = ssh.run(command, timeout=timeout)
    if res.returncode != 0:
        raise FsError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else f"Failed: {command}")
    return res.stdout


def home(ssh: SshMaster) -> str:
    return _run(ssh, 'printf %s "$HOME"').strip() or "/"


def expand(ssh: SshMaster, path: str) -> str:
    """~/x -> /home/you/x (asks the cluster only when needed)."""
    return home(ssh) + path[1:] if path.startswith("~") else path


def list_dir(ssh: SshMaster, path: str) -> list[Entry]:
    # -H: if path is a link to a folder (Yale's ~/project_pi_xyz), list the folder it points to
    return parse_listing(_run(ssh, f"find -H {q(path)} -mindepth 1 -maxdepth 1 -printf {q(LIST_FORMAT)}", timeout=60))


# Where people keep work on clusters: $HOME, $SCRATCH/$PROJECT/$WORK, site scratch/project trees, links in ~.
PLACES = r"""
emit() { [ -d "$2" ] && printf '%s	%s	%s
' "$1" "$2" "$(readlink -f "$2")"; }
emit Home "$HOME"
for v in SCRATCH PROJECT WORK; do eval "p=\${$v:-}"; [ -n "$p" ] && emit "$(printf %s "$v" | tr A-Z a-z)" "$p"; done
for p in /scratch/$USER /scratch/*/$USER /mmfs1/scratch/*/$USER /project/*/$USER /mmfs1/project/*/$USER          /nfs/*/project/*/$USER /nfs/*/scratch/*/$USER /expanse/lustre/projects/*/$USER          /expanse/lustre/scratch/$USER/temp_project /gpfs/*/$USER /work/$USER; do
  [ -d "$p" ] || continue
  d=$(dirname "$p"); emit "$(basename "$(dirname "$d")")/$(basename "$d")" "$p"
done 2>/dev/null
find "$HOME" -mindepth 1 -maxdepth 1 -type l -xtype d -printf '%f
' 2>/dev/null | sort | while read -r n; do
  emit "$n" "$HOME/$n"; done
"""


@dataclass
class Place:
    label: str
    path: str


def parse_places(text: str) -> list[Place]:
    """One place per real folder, first label wins."""
    seen, out = set(), []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) != 3 or not parts[1]:
            continue
        label, path, real = parts
        if real in seen:
            continue
        seen.add(real or path)
        out.append(Place(label.strip("/") or path, path))
    return out


def places(ssh: SshMaster) -> list[Place]:
    return parse_places(ssh.run(f"bash -c {q(PLACES)}", timeout=30).stdout)


def storage(found: list[Place]) -> list[Place]:
    """Home, Project and Scratch out of the places; "Project (mygroup)" when there are several."""
    picked = []
    for p in found:
        low = p.path.lower()  # scratch first: Expanse scratch is .../scratch/you/temp_project
        kind = "Home" if p.label == "Home" else "Scratch" if "scratch" in low else "Project" if "project" in low else ""
        if kind:
            picked.append((kind, p))
    kinds = [k for k, _ in picked]
    return [Place(k if kinds.count(k) == 1 else f"{k} ({p.label.rsplit('/', 1)[-1]})", p.path) for k, p in picked]


def head_bytes(ssh: SshMaster, path: str, n: int) -> bytes:
    """Up to the first n bytes (plus one, so callers can tell it was cut)."""
    res = ssh.run(f"set -o pipefail; head -c {int(n) + 1} -- {q(path)} | base64 -w0", timeout=300, fast=True)
    if res.returncode != 0:
        raise FsError(res.stderr.strip() or "Could not read file")
    return base64.b64decode(res.stdout)


def read_bytes(ssh: SshMaster, path: str, limit: int = MAX_READ) -> bytes:
    data = head_bytes(ssh, path, limit)
    if len(data) > limit:
        raise FsError(f"File is larger than {limit // (1024 * 1024)} MB")
    return data


def write_bytes(ssh: SshMaster, path: str, data: bytes) -> None:
    tmp = posixpath.join(posixpath.dirname(path) or ".", f".{posixpath.basename(path)}.hpchub-tmp")
    cmd = f"cat > {q(tmp)} && mv -f -- {q(tmp)} {q(path)}"
    res = subprocess.run(ssh.argv(cmd), input=data, capture_output=True, timeout=300)
    if res.returncode != 0:
        raise FsError(res.stderr.decode(errors="replace").strip() or "Could not save file")


def mkdir(ssh: SshMaster, path: str) -> None:
    _run(ssh, f"mkdir -p -- {q(path)}")


def rename(ssh: SshMaster, src: str, dst: str) -> None:
    _run(ssh, f"test ! -e {q(dst)} && mv -- {q(src)} {q(dst)} || {{ echo 'Name already exists' >&2; exit 1; }}")


def copy(ssh: SshMaster, src: str, dest_dir: str) -> None:
    """Copy within one cluster (paste on the cluster it came from)."""
    _run(ssh, f"cp -r -- {q(src)} {q(dest_dir)}/", timeout=3600)


def remove(ssh: SshMaster, path: str) -> None:
    if len([part for part in path.split("/") if part not in ("", ".", "~")]) < 2:
        raise FsError("Refusing to delete that")
    _run(ssh, f"rm -rf -- {q(path)}", timeout=600)


def zip_command(path: str) -> str:
    parent, name = posixpath.split(path.rstrip("/"))
    return (f"cd {q(parent or '/')} && if command -v zip >/dev/null; then zip -qry {q(name + '.zip')} {q(name)}; "
            f"else tar czf {q(name + '.tar.gz')} {q(name)}; fi")


def unzip_command(path: str) -> str:
    parent, name = posixpath.split(path)
    if name.endswith(".zip"):
        extract = f"unzip -oq {q(name)}"
    elif name.endswith((".tar.gz", ".tgz", ".tar", ".tar.bz2", ".tar.xz")):
        extract = f"tar xf {q(name)}"
    else:
        raise FsError("Not a zip or tar archive")
    return f"cd {q(parent or '/')} && {extract}"


def make_zip(ssh: SshMaster, path: str) -> None:
    _run(ssh, zip_command(path), timeout=3600)


def extract(ssh: SshMaster, path: str) -> None:
    _run(ssh, unzip_command(path), timeout=3600)


def download(ssh: SshMaster, remote_path: str, local_path: str) -> None:
    res = subprocess.run(ssh.copy_argv(":" + remote_path, local_path), capture_output=True, text=True)
    if res.returncode != 0:
        raise FsError(res.stderr.strip() or "Download failed")


def upload(ssh: SshMaster, local_path: str, remote_dir: str) -> None:
    res = subprocess.run(ssh.copy_argv(local_path, ":" + remote_dir.rstrip("/") + "/"), capture_output=True, text=True)
    if res.returncode != 0:
        raise FsError(res.stderr.strip() or "Upload failed")
