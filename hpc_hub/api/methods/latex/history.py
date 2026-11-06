from ....latex import history
from ...hub import hub
from ...server import method


@method("latex.git_state")
def git_state(cluster: str, folder: str) -> dict:
    """root "" when the folder is not in a repository. Paths are from the repository's top."""
    return history.state(hub().connected(cluster).ssh, folder)


@method("latex.git_log")
def git_log(cluster: str, folder: str, ref: str = "HEAD", limit: int = 300) -> list[dict]:
    return history.log(hub().connected(cluster).ssh, folder, ref or "HEAD", max(1, min(int(limit), 2000)))


@method("latex.git_changes")
def git_changes(cluster: str, folder: str, frm: str = "", to: str = "", context: int = 3) -> dict:
    """to "" is the files now, frm "" is to's parent."""
    return history.changes(hub().connected(cluster).ssh, folder, frm, to, max(0, min(int(context), 50)))


@method("latex.git_blame")
def git_blame(cluster: str, folder: str, path: str) -> dict:
    return history.blame(hub().connected(cluster).ssh, folder, path)


@method("latex.git_line")
def git_line(cluster: str, folder: str, path: str, line: int, at: str = "") -> dict:
    """The commit that last changed a line; with at, path is from the repository's top."""
    return history.line_story(hub().connected(cluster).ssh, folder, path, int(line), at)


@method("latex.git_refs")
def git_refs(cluster: str, folder: str) -> dict:
    return history.refs(hub().connected(cluster).ssh, folder)


@method("latex.git_lanes")
def git_lanes(cluster: str, folder: str, a: str, b: str) -> dict:
    return history.lanes(hub().connected(cluster).ssh, folder, a, b)


@method("latex.git_file")
def git_file(cluster: str, folder: str, at: str, path: str) -> dict:
    return {"text": history.file_at(hub().connected(cluster).ssh, folder, at, path)}
