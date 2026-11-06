"""VS Code on a compute node: a batch job that runs a tunnel, opened in the app or the browser."""

import re
import shutil
import subprocess

from ...compute import job_log, sbatch, slurm
from ...core import remote
from ...files import remote_fs
from ...terminals import links, tmux
from ..hub import hub
from ..server import method
from .clusters import _profile
from .tools import progress

VSCODE_JOB = "hpc-hub-vscode"
VSCODE_JOBS = [VSCODE_JOB, "vscode", "vs-code", "vscode_slurm.sh"]  # also your own scripts' jobs
TARGETS = ("desktop", "browser")
TUNNEL = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


@method("tools.vscode_find")
def vscode_find(cluster: str) -> dict:
    """Your VS Code job if one is pending or running, and its tunnel once it printed one."""
    s = hub().connected(cluster)
    job = slurm.find_job(s.ssh, VSCODE_JOBS)
    if not job:
        return {"job": None, "tunnel": ""}
    found = {"id": job.job_id, "node": job.node, "name": job.name, "resources": slurm.resources(s.ssh, job.job_id)}
    return {"job": found, "tunnel": links.tunnel_name(job_log.tunnel_link(s.ssh, job.job_id))}


def _follow(s, job_id: str) -> dict:
    return {"argv": s.ssh.argv(job_log.follow_log(job_id), tty=True), "job": job_id,
            "title": f"VS Code · {s.cfg.name} · job {job_id}", "color": tmux.AGENT_COLORS["vscode"]}


@method("tools.vscode_start")
def vscode_start(cluster: str, folder: str = "", target: str = "", job: str = "", replace_job: bool = False,
                 profile: dict | None = None, remember: bool = False, remember_folder: bool = False,
                 ask: bool | None = None) -> dict:
    """Open folder through the VS Code job's tunnel. job: the running one to use ({"open": ...} once its tunnel
    is known), or to stop first (replace_job). With none, submits one. {"follow": ...} is the command line that
    shows the job's log, where the tunnel link appears."""
    s = hub().connected(cluster)
    v = s.cfg.vscode
    target = target or v.open_in
    if target not in TARGETS:
        raise ValueError(f"Open in {target}?")
    picked = _profile(v.compute, profile) if profile else v.compute
    where = remote_fs.expand(s.ssh, folder.strip() or v.workdir)
    if ask is not None and ask != v.ask:
        v.ask = ask
        hub().save_clusters()
    if remember:
        v.open_in = target
        if not job or replace_job:
            v.compute = picked
        if remember_folder:
            v.workdir = folder.strip() or v.workdir
        hub().save_clusters()
    if job and not replace_job:
        if not job.isdigit():
            raise ValueError("That job id looks wrong")
        tunnel = links.tunnel_name(job_log.tunnel_link(s.ssh, job))
        if tunnel:
            return {"open": vscode_open(tunnel, where, target), "folder": where, "target": target}
        return {"follow": _follow(s, job), "folder": where, "target": target}
    if job:
        progress(cluster, f"Stopping VS Code job {job}…")
        slurm.cancel(s.ssh, job)
    body = "\n".join(x for x in (remote.cd_part(v.workdir), v.setup, v.command) if x.strip())
    job_id = sbatch.submit(s.ssh, s.fit(picked), VSCODE_JOB, body)
    s._log(f"Submitted VS Code job {job_id}")
    return {"follow": _follow(s, job_id), "folder": where, "target": target, "submitted": job_id}


@method("tools.vscode_open")
def vscode_open(tunnel: str, folder: str = "", target: str = "desktop") -> dict:
    """In the VS Code app when it is installed here, else in the browser."""
    if not TUNNEL.match(tunnel):
        raise ValueError("That tunnel name looks wrong")
    desktop, browser = links.tunnel_urls(tunnel, folder)
    if target == "desktop" and shutil.which("code"):
        subprocess.Popen(["code", "--folder-uri", desktop], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
        return {"app": True, "url": desktop, "missing": False}
    return {"app": False, "url": browser, "missing": target == "desktop"}


@method("tools.forward")
def forward(cluster: str, url: str, job: str = "", node: str = "") -> str:
    """A web server the VS Code job printed (code serve-web): forward its port here, answer the local link."""
    s = hub().connected(cluster)
    link = links.classify(url, node=node)
    if link.kind != links.LOCAL_WEB:
        raise ValueError("Not a link on the node")
    if not node and job.isdigit():
        node = slurm.node_of(s.ssh, job)
    host = node if link.host in links.LOCAL_HOSTS else link.host
    if not host:
        raise RuntimeError("No node for that link")
    return links.local_url(link, s.ssh.forward(host, link.port))
