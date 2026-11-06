import posixpath

from ....files import remote_fs
from ....latex.synctex import SyncTex
from ...hub import hub
from ...server import method
from .files import stat

_syncs: dict[tuple[str, str], tuple[str, SyncTex]] = {}  # (cluster, file) -> (mtime, parsed)


def _parsed(cluster: str, main: str) -> SyncTex:
    """The build's .synctex.gz, read again only when it changed."""
    ssh = hub().connected(cluster).ssh
    path = posixpath.splitext(main)[0] + ".synctex.gz"
    st = stat(ssh, path)
    if not st:
        raise RuntimeError("Build once to link the PDF and the source")
    key = (cluster, path)
    cached = _syncs.get(key)
    if cached and cached[0] == st[1]:
        return cached[1]
    parsed = SyncTex.from_gz(remote_fs.read_bytes(ssh, path))
    _syncs[key] = (st[1], parsed)
    return parsed


@method("latex.sync_view")
def sync_view(cluster: str, main: str, path: str, line: int) -> dict | None:
    """Source line -> {page, x, y} on the PDF, in points from the top left."""
    spot = _parsed(cluster, main).view(path, int(line), posixpath.dirname(main))
    return {"page": spot.page, "x": spot.x, "y": spot.y} if spot else None


@method("latex.sync_edit")
def sync_edit(cluster: str, main: str, page: int, x: float, y: float) -> dict | None:
    hit = _parsed(cluster, main).edit(int(page), float(x), float(y))
    if not hit or not hit[0]:
        return None
    path = hit[0] if hit[0].startswith("/") else posixpath.join(posixpath.dirname(main), hit[0])
    return {"path": posixpath.normpath(path), "line": hit[1]}


@method("latex.git_sync_lines")
def git_sync_lines(cluster: str, main: str, path: str, lines: list[int]) -> list[dict | None]:
    """sync_view for many lines at once, to mark changes on the PDF."""
    st, folder = _parsed(cluster, main), posixpath.dirname(main)
    out = []
    for n in lines[:2000]:
        spot = st.view(path, int(n), folder)
        out.append({"line": int(n), "page": spot.page, "x": spot.x, "y": spot.y} if spot else None)
    return out
