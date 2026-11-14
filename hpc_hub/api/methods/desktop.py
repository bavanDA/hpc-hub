"""The Desktop: a Linux desktop on a compute node (compute/desktop_job.py), shown in the app's viewer. One per
cluster. Opening it forwards its VNC port over SSH and puts the local bridge (compute/vnc_bridge.py) in front, so
the viewer gets ws://127.0.0.1:<port>/<one-time token> and the desktop's password; nothing listens beyond this
computer."""

import threading

from ...compute import desktop_job, sbatch, slurm, vnc_bridge
from ..hub import hub
from ..server import method
from .clusters import _profile

_bridges: dict[str, vnc_bridge.Bridge] = {}  # "cluster/job" -> the bridge its viewer uses
_lock = threading.Lock()


def _job(job: str) -> str:
    if not job.isdigit():
        raise ValueError("That job id looks wrong")
    return job


@method("desktop.find")
def find(cluster: str) -> dict:
    """Your desktop on this cluster, if one is waiting or running."""
    s = hub().connected(cluster)
    job = slurm.find_job(s.ssh, [desktop_job.JOB_NAME])
    return {"job": {"id": job.job_id, "node": job.node} if job else None}


@method("desktop.start")
def start(cluster: str, profile: dict | None = None, width: int = 1600, height: int = 900) -> dict:
    """Submit a desktop job (profile: its size and time; the cluster's usual one when not given). width x height:
    the screen, the viewer's window. One desktop per cluster."""
    s = hub().connected(cluster)
    if running := slurm.find_job(s.ssh, [desktop_job.JOB_NAME]):
        raise RuntimeError(f"You already have a desktop on {s.cfg.short_name} (job {running.job_id}). Open that one, "
                           "or stop it first")
    picked = _profile(s.cfg.profile, profile) if profile else s.cfg.profile
    job = sbatch.submit(s.ssh, s.fit(picked), desktop_job.JOB_NAME, desktop_job.body(width, height))
    s._log(f"Submitted desktop job {job}")
    return {"job": job}


@method("desktop.status")
def status(cluster: str, job: str) -> dict:
    """How far it got: queued (with Slurm's reason), starting, ready, or ended (problem says why)."""
    s = hub().connected(cluster)
    return desktop_job.status(_job(job), s.ssh.run(desktop_job.status_command(job), timeout=30).stdout)


@method("desktop.open")
def open_(cluster: str, job: str) -> dict:
    """What the viewer needs once the desktop is ready: {url, password, title}. The port is forwarded here over SSH
    and the bridge listens on 127.0.0.1 only, with a one-time token; opening again reuses them."""
    s = hub().connected(cluster)
    got = status(cluster, job)
    if got["phase"] != "ready":
        raise RuntimeError(got["problem"] or "The desktop isn't ready yet")
    password = s.ssh.run(desktop_job.password_command(job), timeout=30).stdout.strip()
    if not password:
        raise RuntimeError("Could not read the desktop's password on the cluster")
    key = f"{cluster}/{job}"
    with _lock:
        bridge = _bridges.get(key)
        if not bridge or bridge.closed:
            bridge = _bridges[key] = vnc_bridge.Bridge("127.0.0.1", s.ssh.forward(got["node"], got["port"]))
    return {"url": bridge.url, "password": password, "node": got["node"],
            "title": f"Desktop on {s.cfg.short_name} · {got['node']}"}


@method("desktop.stop")
def stop(cluster: str, job: str) -> None:
    """End the desktop: its job, its private folder, and the bridge here."""
    s = hub().connected(cluster)
    slurm.cancel(s.ssh, _job(job))
    s.ssh.run(desktop_job.cleanup_command(job), timeout=30)
    with _lock:
        bridge = _bridges.pop(f"{cluster}/{job}", None)
    if bridge:
        bridge.close()
    s._log(f"Stopped desktop job {job}")
