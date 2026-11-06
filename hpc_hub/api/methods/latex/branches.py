from ....latex import branches
from ...hub import hub
from ...server import method
from . import jobs


@method("latex.git_switch_check")
def git_switch_check(cluster: str, folder: str, target: str) -> dict:
    return branches.check(hub().connected(cluster).ssh, folder, target)


@method("latex.git_switch")
def git_switch(cluster: str, folder: str, target: str, mode: str = "bring") -> dict:
    """mode bring: your changes come along; keep: they stay with this branch."""
    ssh = hub().connected(cluster).ssh
    return jobs.run("switch", cluster, folder, lambda step: branches.switch(ssh, folder, target, mode, step))


@method("latex.git_new_branch")
def git_new_branch(cluster: str, folder: str, name: str, start: str = "") -> str:
    return branches.new_branch(hub().connected(cluster).ssh, folder, name.strip(), start)
