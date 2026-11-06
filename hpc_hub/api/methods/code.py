"""The Code page: open, save and watch files on a cluster (code/edit.py), and search a folder. Types in
app/src/types/code.ts."""

from dataclasses import asdict

from ...code import edit
from ...files import remote_fs
from ..hub import hub
from ..server import method


def _ssh(cluster: str):
    return hub().connected(cluster).ssh


def _path(ssh, path: str) -> str:
    return remote_fs.expand(ssh, path.strip())


@method("code.open")
def open_file(cluster: str, path: str) -> dict:
    """The text and what saving it back needs (sha, line endings); read-only when it isn't UTF-8 or is too big."""
    ssh = _ssh(cluster)
    opened = edit.open_file(ssh, _path(ssh, path))
    return {**asdict(opened), "path": path}


@method("code.save")
def save(cluster: str, path: str, text: str, base_sha: str, eol: str = "lf", force: bool = False) -> dict:
    """Saves only if the file still has base_sha (unless force); else answers the conflict."""
    ssh = _ssh(cluster)
    return edit.save(ssh, _path(ssh, path), text, base_sha, "crlf" if eol == "crlf" else "lf", force)


@method("code.stat")
def stat(cluster: str, paths: list[str]) -> list[dict]:
    """What each open file looks like now, to notice changes from an agent or a job."""
    ssh = _ssh(cluster)
    full = {_path(ssh, p): p for p in paths}
    return [{**asdict(s), "path": full.get(s.path, s.path)} for s in edit.stat(ssh, list(full))]


@method("code.new_file")
def new_file(cluster: str, path: str, text: str = "") -> dict:
    """Makes the file (never over an existing one) and opens it."""
    ssh = _ssh(cluster)
    full = _path(ssh, path)
    edit.new_file(ssh, full, text)
    return {**asdict(edit.open_file(ssh, full)), "path": path}


@method("code.find_files")
def find_files(cluster: str, root: str, query: str = "") -> list[dict]:
    ssh = _ssh(cluster)
    return edit.find_files(ssh, _path(ssh, root or "~"), query)

