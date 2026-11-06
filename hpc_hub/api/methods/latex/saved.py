from ....latex import history, saved
from ...hub import hub
from ...server import method


@method("latex.git_saved")
def git_saved(cluster: str, folder: str, branch: str = "") -> list[dict]:
    """Saved versions of a branch (yours now if ""), newest first."""
    return saved.versions(hub().connected(cluster).ssh, folder, branch)


@method("latex.git_saved_setting")
def git_saved_setting(cluster: str, folder: str, mode: str) -> str:
    return saved.setting(hub().connected(cluster).ssh, folder, mode)


@method("latex.git_restore")
def git_restore(cluster: str, folder: str, version: str) -> dict:
    return saved.restore(hub().connected(cluster).ssh, folder, version)


@method("latex.git_put_back")
def git_put_back(cluster: str, folder: str, path: str, line: int, expect: list[str], lines: list[str]) -> None:
    """Lines from `line` that still read `expect` become `lines`; path is from the repository's top."""
    ssh = hub().connected(cluster).ssh
    if path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Bad path")
    root = history.state(ssh, folder)["root"]
    saved.put_back(ssh, f"{root}/{path}", int(line), expect, lines)
