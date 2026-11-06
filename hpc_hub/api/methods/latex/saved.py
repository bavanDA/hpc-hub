from ....latex import history, saved
from ...hub import hub
from ...server import method


def _ssh(cluster: str):
    return hub().connected(cluster).ssh


@method("latex.git_saved")
def git_saved(cluster: str, folder: str, branch: str = "") -> list[dict]:
    """Saved versions of a branch (yours now if ""), newest first."""
    return saved.versions(_ssh(cluster), folder, branch)


@method("latex.git_saved_setting")
def git_saved_setting(cluster: str, folder: str, mode: str) -> str:
    return saved.setting(_ssh(cluster), folder, mode)


@method("latex.git_restore")
def git_restore(cluster: str, folder: str, version: str) -> dict:
    return saved.restore(_ssh(cluster), folder, version)


@method("latex.git_put_back")
def git_put_back(cluster: str, folder: str, path: str, line: int, expect: list[str], lines: list[str]) -> None:
    """Lines from `line` that still read `expect` become `lines`; path is from the repository's top."""
    ssh = _ssh(cluster)
    if path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Bad path")
    root = history.state(ssh, folder)["root"]
    saved.put_back(ssh, f"{root}/{path}", int(line), expect, lines)
