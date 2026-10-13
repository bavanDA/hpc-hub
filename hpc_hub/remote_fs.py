"""Files on a cluster, through the SSH master: list, read, write, zip, copy."""

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


def list_dir(ssh: SshMaster, path: str) -> list[Entry]:
    return parse_listing(_run(ssh, f"find {q(path)} -mindepth 1 -maxdepth 1 -printf {q(LIST_FORMAT)}", timeout=60))


def read_bytes(ssh: SshMaster, path: str, limit: int = MAX_READ) -> bytes:
    res = subprocess.run(ssh.argv(f"head -c {int(limit) + 1} -- {q(path)}"), capture_output=True, timeout=300,
                         stdin=subprocess.DEVNULL)
    if res.returncode != 0:
        raise FsError(res.stderr.decode(errors="replace").strip() or "Could not read file")
    if len(res.stdout) > limit:
        raise FsError(f"File is larger than {limit // (1024 * 1024)} MB")
    return res.stdout


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
