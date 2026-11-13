"""Connect, disconnect and compute nodes per cluster, the settings the Clusters page may change, and its log."""

from dataclasses import fields, replace

from ...compute import gpus as gpu_list
from ...compute import slurm_args
from ...connect import vpn_helper
from ...connect.state import State
from ...core.config import ComputeProfile
from ...core.paths import log_dir
from ..hub import hub
from ..server import method
from .app import cluster_json
from .logins import for_connect

# extra_args stays out: free text that ends up on a command line
PROFILE_KEYS = {f.name for f in fields(ComputeProfile)} - {"extra_args"}
INT_KEYS = {"cpus", "mem_gb", "gpus"}
LOG_TAIL = 200_000  # bytes read from the end of a log file


def _blocker(session):
    """Another VPN that can't run beside this one: a full tunnel takes over all traffic, and on Windows and macOS
    the VPN helper runs one tunnel, so starting this one would end the other's (its cluster would just drop)."""
    cfg = session.cfg
    one_tunnel = vpn_helper.needs_helper()
    for s in hub().sessions.values():
        if (s is not session and s.cfg.vpn.enabled and cfg.vpn.enabled
                and s.state not in (State.DISCONNECTED, State.ERROR)
                and (not (s.cfg.vpn.split_tunnel and cfg.vpn.split_tunnel)
                     or (one_tunnel and getattr(s, "vpn_used", True)))):
            return s
    return None


@method("clusters.connect")
def connect(cluster: str, vpn_only: bool = False, switch: bool = False) -> dict | None:
    """Start connecting; progress comes as session and log events. When another VPN is in the way, answers
    {"switch": {id, name}} and does nothing, unless switch is true: then that one is disconnected first."""
    s = hub().session(cluster)
    ssh, vpn = for_connect(s.cfg)
    other = _blocker(s)
    if not other:
        s.connect(ssh, vpn, vpn_only)
        return None
    if not switch:
        return {"switch": {"id": other.cfg.id, "name": other.cfg.name}}
    other.disconnect(on_done=lambda: s.connect(ssh, vpn, vpn_only))
    return None


@method("clusters.disconnect")
def disconnect(cluster: str) -> None:
    hub().session(cluster).disconnect()


@method("clusters.cancel")
def cancel(cluster: str) -> None:
    hub().session(cluster).cancel()


def _profile(base: ComputeProfile, changes: dict) -> ComputeProfile:
    unknown = set(changes) - PROFILE_KEYS
    if unknown:
        raise ValueError(f"Can't change {', '.join(sorted(unknown))}")
    clean = {}
    for k, v in changes.items():
        if k in INT_KEYS:
            if isinstance(v, bool) or not isinstance(v, int):
                raise ValueError(f"{k} must be a whole number")
            clean[k] = v
        else:
            clean[k] = str(v).strip()
    p = replace(base, **clean)
    if p.gpus < 0:
        raise ValueError("GPUs can't be negative")
    if not p.gpus:
        p = replace(p, gpu_type="")
    elif p.gpu_type and gpu_list.describe(p.gpu_type)[2] and p.gpus > 1:
        raise ValueError("One GPU slice per job. Pick a bigger slice or a whole GPU")
    errors = slurm_args.validate(p)
    if errors:
        raise ValueError(". ".join(errors))
    return p


@method("clusters.request_node")
def request_node(cluster: str, profile: dict | None = None, remember: bool = False) -> None:
    """Ask Slurm for a node (profile: what you picked, else the saved one); remember saves it as the default."""
    s = hub().connected(cluster)
    picked = _profile(s.cfg.profile, profile) if profile else None
    if picked and remember:
        s.cfg.profile = picked
        hub().save_clusters()
    s.request_node(picked)


@method("clusters.release_node")
def release_node(cluster: str) -> None:
    """Cancel the node the app asked for, or just stop using your own job. You stay connected."""
    hub().connected(cluster).release_node()


@method("clusters.update")
def update(cluster: str, changes: dict) -> dict:
    """Change and save request_node_on_connect, ask_node, the compute profile, or vpn.same_login_as_ssh."""
    cfg = hub().session(cluster).cfg
    unknown = set(changes) - {"request_node_on_connect", "ask_node", "profile", "vpn"}
    if unknown:
        raise ValueError(f"Can't change {', '.join(sorted(unknown))}")
    vpn = changes.get("vpn") or {}
    if set(vpn) - {"same_login_as_ssh"}:
        raise ValueError("Only the VPN's same login setting can change here")
    profile = _profile(cfg.profile, changes["profile"]) if "profile" in changes else cfg.profile
    for k in ("request_node_on_connect", "ask_node"):
        if k in changes:
            setattr(cfg, k, bool(changes[k]))
    if "same_login_as_ssh" in vpn:
        cfg.vpn.same_login_as_ssh = bool(vpn["same_login_as_ssh"])
    cfg.profile = profile
    hub().save_clusters()
    return cluster_json(cfg)


@method("clusters.log")
def log(cluster: str, lines: int = 200) -> list[str]:
    """The last lines of the cluster's log file as 'HH:MM:SS  text', so the card's log survives a restart."""
    path = log_dir() / f"{hub().session(cluster).cfg.id}.log"
    try:
        with open(path, "rb") as fh:
            fh.seek(max(0, path.stat().st_size - LOG_TAIL))
            text = fh.read().decode("utf-8", "replace")
    except OSError:
        return []
    out = []
    for line in text.splitlines()[-lines:]:
        day, _, rest = line.partition(" ")
        clock, _, rest = rest.partition(" ")
        out.append(f"{clock}  {rest}" if len(day) == 10 and len(clock) == 8 else line)
    return out
