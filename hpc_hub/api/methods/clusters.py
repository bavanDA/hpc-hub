"""Connect, disconnect and compute nodes per cluster, the settings the Clusters page may change, and logins
kept in the keyring (passwords go in, never out)."""

from dataclasses import asdict, fields, replace

from ...compute import slurm
from ...connect.state import State
from ...core import credentials
from ...core.config import ComputeProfile
from ...core.paths import log_dir
from ..hub import hub
from ..server import method

# extra_args stays out: free text that ends up on a command line
PROFILE_KEYS = {f.name for f in fields(ComputeProfile)} - {"extra_args"}
INT_KEYS = {"cpus", "mem_gb", "gpus"}
KINDS = (credentials.SSH, credentials.VPN)
LOG_TAIL = 200_000  # bytes read from the end of a log file


def _logins(cfg) -> tuple[credentials.Login, credentials.Login | None]:
    """The saved SSH and VPN logins, like the GTK app's connect: the VPN uses the SSH login or its own."""
    ssh = credentials.load(cfg.id, credentials.SSH)
    if not ssh or not ssh.username:
        raise ValueError(f"Add your {cfg.name} username in the cluster's settings first")
    if not cfg.vpn.enabled:
        return ssh, None
    vpn = ssh if cfg.vpn.same_login_as_ssh else credentials.load(cfg.id, credentials.VPN)
    if vpn and not vpn.password:
        vpn = credentials.Login(vpn.username, ssh.password)
    if not vpn or not vpn.username:
        raise ValueError(f"Add your {cfg.name} VPN login in the cluster's settings first")
    return ssh, vpn


def _blocker(session):
    """Another VPN that can't run beside this one (a full tunnel takes over all traffic)."""
    cfg = session.cfg
    for s in hub().sessions.values():
        if (s is not session and s.cfg.vpn.enabled and cfg.vpn.enabled
                and not (s.cfg.vpn.split_tunnel and cfg.vpn.split_tunnel)
                and s.state not in (State.DISCONNECTED, State.ERROR)):
            return s
    return None


@method("clusters.connect")
def connect(cluster: str, vpn_only: bool = False, switch: bool = False) -> dict | None:
    """Start connecting; progress comes as session and log events. When another VPN is in the way, answers
    {"switch": {id, name}} and does nothing, unless switch is true: then that one is disconnected first."""
    s = hub().session(cluster)
    ssh, vpn = _logins(s.cfg)
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
    errors = slurm.validate(p)
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
    """Change and save request_node_on_connect, the compute profile, or vpn.same_login_as_ssh."""
    cfg = hub().session(cluster).cfg
    unknown = set(changes) - {"request_node_on_connect", "profile", "vpn"}
    if unknown:
        raise ValueError(f"Can't change {', '.join(sorted(unknown))}")
    vpn = changes.get("vpn") or {}
    if set(vpn) - {"same_login_as_ssh"}:
        raise ValueError("Only the VPN's same login setting can change here")
    profile = _profile(cfg.profile, changes["profile"]) if "profile" in changes else cfg.profile
    if "request_node_on_connect" in changes:
        cfg.request_node_on_connect = bool(changes["request_node_on_connect"])
    if "same_login_as_ssh" in vpn:
        cfg.vpn.same_login_as_ssh = bool(vpn["same_login_as_ssh"])
    cfg.profile = profile
    hub().save_clusters()
    return asdict(cfg)


@method("clusters.login")
def login(cluster: str) -> dict:
    """The saved usernames, and whether a password is saved. Passwords never leave the keyring."""
    cfg = hub().session(cluster).cfg
    out = {}
    for kind in KINDS:
        saved = credentials.load(cfg.id, kind)
        out[kind] = {"username": saved.username if saved else "", "password": bool(saved and saved.password)}
    return out


@method("clusters.set_login")
def set_login(cluster: str, kind: str, username: str, password: str | None = None) -> None:
    """Save a login. An empty password keeps the saved one (leave it empty for SSH key logins)."""
    cfg = hub().session(cluster).cfg
    if kind not in KINDS:
        raise ValueError(f"No login kind {kind}")
    username = username.strip()
    if not username:
        raise ValueError("Username is empty")
    saved = credentials.load(cfg.id, kind)
    password = password or (saved.password if saved else "")
    if saved and saved.username == username and saved.password == password:
        return
    credentials.save(cfg.id, kind, credentials.Login(username, password))


@method("clusters.forget_logins")
def forget_logins(cluster: str) -> None:
    cfg = hub().session(cluster).cfg
    for kind in KINDS:
        credentials.clear(cfg.id, kind)


@method("clusters.partitions")
def partitions(cluster: str, partition: str = "", qos: str = "") -> dict:
    """What Slurm allows here (read at the last login): partitions, your QoS, and the longest time (minutes)
    a job on this partition and QoS may ask for. known is false until you connected once."""
    lim = hub().session(cluster).limits
    if not lim:
        return {"known": False, "partitions": [], "default_partition": "", "qos": [], "default_qos": "",
                "longest": None, "why": ""}
    longest, why = lim.longest(partition.strip(), qos.strip())
    return {"known": True, "partitions": list(lim.partitions), "default_partition": lim.default_partition,
            "qos": lim.allowed_qos, "default_qos": lim.default_qos, "longest": longest, "why": why}


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
