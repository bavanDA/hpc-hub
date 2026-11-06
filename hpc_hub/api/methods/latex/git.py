from dataclasses import asdict

from ....latex import git
from ...hub import hub
from ...server import method


@method("latex.git_info")
def git_info(cluster: str, folder: str) -> dict:
    """root "" when the folder is not in a repository."""
    i = git.info(hub().connected(cluster).ssh, folder)
    return {"root": i.root, "branch": i.branch, "remotes": [{"name": n, "url": u} for n, u in i.remotes.items()],
            "changes": [{"status": c[:2].strip(), "path": c[3:]} for c in i.changes],
            "history": [asdict(c) for c in i.history]}


@method("latex.git_commit")
def git_commit(cluster: str, folder: str, message: str) -> str:
    if not message.strip():
        raise ValueError("Write a message first")
    return git.commit_all(hub().connected(cluster).ssh, folder, message.strip())


@method("latex.git_commit_split")
def git_commit_split(cluster: str, folder: str, commits: list[dict]) -> dict:
    """[{message, files}] in order; the last one takes everything left, so nothing stays behind."""
    if len(commits) < 2:
        raise ValueError("Give at least two commits")
    ssh = hub().connected(cluster).ssh
    for done, c in enumerate(commits):
        message = str(c.get("message", "")).strip()
        if not message:
            raise ValueError("Every commit needs a message")
        try:
            if done == len(commits) - 1:
                git.commit_all(ssh, folder, message)
            else:
                git.commit_paths(ssh, folder, message, [str(p) for p in c.get("files") or []])
        except git.GitError as e:
            raise git.GitError(f"{done} of {len(commits)} committed, then: {e}") from e
    return {"commits": len(commits)}


@method("latex.git_pull")
def git_pull(cluster: str, folder: str) -> str:
    return git.pull(hub().connected(cluster).ssh, folder)


@method("latex.git_push")
def git_push(cluster: str, folder: str) -> str:
    return git.push(hub().connected(cluster).ssh, folder)


@method("latex.git_show")
def git_show(cluster: str, folder: str, commit: str) -> str:
    return git.show(hub().connected(cluster).ssh, folder, commit)
