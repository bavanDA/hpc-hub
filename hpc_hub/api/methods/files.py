"""Files on a cluster: list, read, make, rename, delete, zip."""

import base64
import posixpath
from dataclasses import asdict

from ...files import remote_fs
from ..hub import hub
from ..server import method

TEXT_LIMIT = 512 * 1024
MEDIA_LIMIT = 60 * 1024 * 1024
MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
         ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".pdf": "application/pdf"}



def _name(name: str) -> str:
    name = name.strip()
    if not name or "/" in name or name in (".", ".."):
        raise ValueError("Pick a name without /")
    return name


@method("files.list")
def list_dir(cluster: str, path: str = "") -> dict:
    """"" is home; path comes back absolute."""
    ssh = hub().connected(cluster).ssh
    target = remote_fs.expand(ssh, path.strip() or "~")
    if len(target) > 1:
        target = target.rstrip("/")
    return {"path": target, "entries": [asdict(e) for e in remote_fs.list_dir(ssh, target)]}


@method("files.places")
def places(cluster: str) -> list[dict]:
    return [asdict(p) for p in remote_fs.storage(remote_fs.places(hub().connected(cluster).ssh))]


@method("files.real_path")
def real_path(cluster: str, path: str) -> str:
    """With links followed (Wulver's /scratch is /mmfs1/scratch), as tmux reports a terminal's folder."""
    ssh = hub().connected(cluster).ssh
    got = ssh.run(f"readlink -m -- {remote_fs.q(remote_fs.expand(ssh, path))}", timeout=30).stdout.strip()
    return got.rstrip("/") or path


@method("files.read")
def read(cluster: str, path: str, limit: int = 0) -> dict:
    """Images and PDFs whole as base64, anything else as UTF-8 text cut at limit."""
    ssh = hub().connected(cluster).ssh
    mime = MEDIA.get(remote_fs.ext(path), "")
    if mime:
        data = remote_fs.read_bytes(ssh, path, min(limit or MEDIA_LIMIT, remote_fs.MAX_READ))
        return {"kind": "pdf" if mime.endswith("pdf") else "image", "mime": mime, "size": len(data),
                "data": base64.b64encode(data).decode(), "cut": False}
    limit = min(limit or TEXT_LIMIT, remote_fs.MAX_READ)
    data = remote_fs.head_bytes(ssh, path, limit)
    cut = len(data) > limit
    data = data[:limit]
    if b"\0" in data:
        return {"kind": "binary", "mime": "", "size": len(data), "text": "", "cut": cut}
    return {"kind": "text", "mime": "text/plain", "size": len(data), "text": data.decode("utf-8", "replace"),
            "cut": cut}


@method("files.mkdir")
def mkdir(cluster: str, path: str, name: str) -> str:
    target = posixpath.join(path, _name(name))
    remote_fs.mkdir(hub().connected(cluster).ssh, target)
    return target


@method("files.rename")
def rename(cluster: str, path: str, name: str) -> str:
    target = posixpath.join(posixpath.dirname(path.rstrip("/")), _name(name))
    remote_fs.rename(hub().connected(cluster).ssh, path, target)
    return target


@method("files.delete")
def delete(cluster: str, path: str) -> None:
    remote_fs.remove(hub().connected(cluster).ssh, path)


@method("files.zip")
def make_zip(cluster: str, path: str) -> None:
    remote_fs.make_zip(hub().connected(cluster).ssh, path)


@method("files.extract")
def extract(cluster: str, path: str) -> None:
    remote_fs.extract(hub().connected(cluster).ssh, path)
