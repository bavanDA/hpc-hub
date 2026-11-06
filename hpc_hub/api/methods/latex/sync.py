from ....latex import sync
from ...hub import hub
from ...server import method
from . import jobs


@method("latex.git_sync")
def git_sync(cluster: str, folder: str, push: bool = True) -> dict:
    """Push, or Get the latest with push False; always pulls first."""
    ssh = hub().connected(cluster).ssh
    return jobs.run("push" if push else "pull", cluster, folder, lambda step: sync.start(ssh, folder, bool(push), step))


@method("latex.git_sync_state")
def git_sync_state(cluster: str, folder: str) -> dict | None:
    return sync.status(hub().connected(cluster).ssh, folder)


@method("latex.git_settle")
def git_settle(cluster: str, folder: str, path: str, picks: list[dict]) -> dict | None:
    return sync.settle(hub().connected(cluster).ssh, folder, path, picks)


@method("latex.git_sync_continue")
def git_sync_continue(cluster: str, folder: str) -> dict:
    ssh = hub().connected(cluster).ssh
    st = sync.load(ssh, folder)
    kind = "push" if not st or st.get("push") else "pull"
    return jobs.run(kind, cluster, folder, lambda step: sync.go_on(ssh, folder, step))


@method("latex.git_sync_stop")
def git_sync_stop(cluster: str, folder: str) -> dict:
    return sync.stop(hub().connected(cluster).ssh, folder)
