"""Connect, disconnect and compute nodes per cluster, the settings the Clusters page may change, and its log."""

from dataclasses import fields, replace

from ...compute import gpus as gpu_list
from ...compute import slurm, slurm_args
from ...connect import vpn_helper
from ...connect.state import State
from ...core import credentials
from ...core.config import ComputeProfile
from ...core.paths import log_dir
from ..hub import hub
from ..server import method
from .app import cluster_json
from .logins import for_connect, set_login

# extra_args stays out: free text that ends up on a command line
PROFILE_KEYS = {f.name for f in fields(ComputeProfile)} - {"extra_args"}
INT_KEYS = {"cpus", "mem_gb", "gpus"}
LOG_TAIL = 200_000  # bytes read from the end of a log file


def _blocker(session):
    """Another VPN that can't run beside this one: one of them sends all traffic or all DNS through itself
    (vpn_helper.side_by_side), so starting this one would take the other's cluster away."""
    cfg = session.cfg
    for s in hub().sessions.values():
        if (s is not session and s.cfg.vpn.enabled and cfg.vpn.enabled
                and s.state not in (State.DISCONNECTED, State.ERROR)
                and not (vpn_helper.side_by_side(s.cfg) and vpn_helper.side_by_side(cfg))):
            return s
    return None


@method("clusters.connect", slow=True)
def connect(cluster: str, vpn_only: bool = False, switch: bool = False, username: str = "",
            vpn_username: str = "") -> dict | None:
    """Start connecting; progress comes as session and log events. When another VPN is in the way, answers
    {"switch": {id, name}} and does nothing, unless switch is true: then that one is disconnected first.
    username, vpn_username: typed in setup, saved first when none is saved. Setup brings the VPN up for the key
    page before its last step, which saves the username, and never asked for a VPN login of its own at all
    (Yale's: first.last@yale.edu), so Connect Yale VPN failed and said nothing (2026-11-22)."""
    s = hub().session(cluster)
    for kind, typed in ((credentials.SSH, username), (credentials.VPN, vpn_username)):
        saved = credentials.load(s.cfg.id, kind)
        if typed.strip() and (not saved or not saved.username):
            set_login(s.cfg.id, kind, typed, None, s.cfg.remember_password)
    ssh, vpn = for_connect(s.cfg, vpn_only)
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
    """Stop signing in, or stop waiting for a node: also ends a wait for the sign-in window or a code."""
    h = hub()
    h.session(cluster).cancel()
    h.drop_questions(cluster)


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


class AlreadyWaiting(RuntimeError):
    """A node asked for earlier is still in the queue; the UI asks: keep waiting for it, or cancel it."""
    kind = "already-waiting"


@method("clusters.waiting_node")
def waiting_node(cluster: str) -> dict | None:
    """The app's node request still in the queue, if any: {job, reason}."""
    w = slurm.waiting_job(hub().connected(cluster).ssh)
    return {"job": w.job_id, "reason": "" if w.reason in ("", "None") else w.reason} if w else None


@method("clusters.cancel_waiting")
def cancel_waiting(cluster: str, job: str) -> None:
    """Cancel the app's node request that is still in the queue (only that: a waiting job named hpc-hub)."""
    s = hub().connected(cluster)
    w = slurm.waiting_job(s.ssh)
    if not w or w.job_id != job:
        raise RuntimeError(f"Job {job} isn't waiting in the queue anymore")
    s.cancel()  # in case this session is the one waiting for it
    slurm.cancel(s.ssh, job)
    s._log(f"Cancelled job {job}, which was waiting for a node")


@method("clusters.request_node")
def request_node(cluster: str, profile: dict | None = None, remember: bool = False,
                 keep_waiting: bool = False) -> None:
    """Ask Slurm for a node (profile: what you picked, else the saved one); remember saves it as the default.
    With a request of the app still in the queue (asked before a connection dropped, say), never a second one:
    AlreadyWaiting, unless keep_waiting, which waits for that one."""
    s = hub().connected(cluster)
    if not keep_waiting and (w := slurm.waiting_job(s.ssh)):
        raise AlreadyWaiting(f"You already asked for a node on {s.cfg.short_name}: job {w.job_id} is still "
                             "waiting in the queue")
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
