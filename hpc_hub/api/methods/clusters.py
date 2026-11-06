"""Connect, disconnect and compute nodes per cluster, the settings the Clusters page may change, and logins
kept in the keyring (passwords go in, never out)."""

from dataclasses import asdict, fields, replace

from ...compute import gpus as gpu_list
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


def _memory() -> dict:
    """Passwords of clusters set to "don't remember": (cluster, kind) -> password, only until the app quits."""
    return hub().__dict__.setdefault("passwords", {})


def _unsaved(cfg, kind: str, login: credentials.Login) -> credentials.Login:
    """A login whose password is not kept: the one typed earlier in this run, else ask for it now."""
    if cfg.remember_password or login.password:
        return login
    key = (cfg.id, kind)
    if key not in _memory():
        what = "VPN password" if kind == credentials.VPN else "Password"
        typed = hub().question("ask", {"cluster": cfg.id, "name": cfg.name,
                                       "prompt": f"{what} for {login.username} on {cfg.name}"})
        if not typed:
            raise ValueError("No password, so not connecting")
        _memory()[key] = typed
    return credentials.Login(login.username, _memory()[key])


def _logins(cfg) -> tuple[credentials.Login, credentials.Login | None]:
    """The saved SSH and VPN logins, like the GTK app's connect: the VPN uses the SSH login or its own."""
    ssh = credentials.load(cfg.id, credentials.SSH)
    if not ssh or not ssh.username:
        raise ValueError(f"Add your {cfg.name} username in the cluster's settings first")
    ssh = _unsaved(cfg, credentials.SSH, ssh)
    if not cfg.vpn.enabled:
        return ssh, None
    vpn = ssh if cfg.vpn.same_login_as_ssh else credentials.load(cfg.id, credentials.VPN)
    if vpn and not cfg.vpn.same_login_as_ssh:
        vpn = _unsaved(cfg, credentials.VPN, vpn)
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
    if not p.gpus:
        p = replace(p, gpu_type="")
    elif p.gpu_type and gpu_list.describe(p.gpu_type)[2] and p.gpus > 1:
        raise ValueError("One GPU slice per job. Pick a bigger slice or a whole GPU")
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


@method("clusters.request_fast_node")
def request_fast_node(cluster: str) -> None:
    """A node on the cluster's fast queue (Settings: Fast node), with your usual cores and memory."""
    s = hub().connected(cluster)
    if not s.cfg.fast_profile():
        raise ValueError(f"{s.cfg.name} has no fast queue set")
    s.request_fast_node()


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
    return asdict(cfg)


@method("clusters.login")
def login(cluster: str) -> dict:
    """The saved usernames, and whether a password is saved. Passwords never leave the keyring."""
    cfg = hub().session(cluster).cfg
    out = {}
    for kind in KINDS:
        saved = credentials.load(cfg.id, kind)
        out[kind] = {"username": saved.username if saved else "", "password": bool(saved and saved.password)}
    out["remember"] = cfg.remember_password
    return out


@method("clusters.set_login")
def set_login(cluster: str, kind: str, username: str, password: str | None = None, remember: bool = True) -> None:
    """Save a login. An empty password keeps the saved one (leave it empty for SSH key logins).
    remember False: the keyring keeps only the username; the password is asked once per run, kept in memory."""
    cfg = hub().session(cluster).cfg
    if cfg.remember_password != remember:
        cfg.remember_password = remember
        hub().save_clusters()
    if not remember:
        if not username.strip():
            raise ValueError("Username is empty")
        if password:
            _memory()[(cfg.id, kind)] = password
        password = None
        saved = credentials.load(cfg.id, kind)
        if not (saved and saved.username == username.strip() and not saved.password):
            credentials.save(cfg.id, kind, credentials.Login(username.strip(), ""))
        return
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
def forget_logins(cluster: str, keep_username: bool = False) -> None:
    """Remove the saved passwords. keep_username: the username stays, so only the password is asked next time."""
    cfg = hub().session(cluster).cfg
    for kind in KINDS:
        saved = credentials.load(cfg.id, kind) if keep_username else None
        credentials.clear(cfg.id, kind)
        _memory().pop((cfg.id, kind), None)
        if saved and saved.username:
            credentials.save(cfg.id, kind, credentials.Login(saved.username, ""))


@method("clusters.partitions")
def partitions(cluster: str, partition: str = "", qos: str = "", account: str = "") -> dict:
    """What Slurm allows here (read at the last login): partitions, the groups you may bill (accounts) and the QoS
    of the one picked (or all yours), the longest time (minutes) a job on this partition and QoS may ask for, and
    the cores and GB one job may ask for there, the memory each core comes with (more memory takes more cores), and
    the QoS's GPU caps ({"l40": 0}: not with this QoS), and billing: what an hour costs in SUs (None: Slurm sets
    no weights here). known is false until you connected once."""
    lim = hub().session(cluster).limits
    if not lim:
        return {"known": False, "partitions": [], "default_partition": "", "qos": [], "default_qos": "",
                "accounts": [], "default_account": "", "longest": None, "why": "", "cores": None, "memory_gb": None,
                "mem_per_core_gb": None, "gpu_caps": {}, "billing": None}
    longest, why = lim.longest(partition.strip(), qos.strip())
    part = partition.strip() or lim.default_partition
    cores, memory_gb = lim.biggest(part, qos.strip())
    per_core = lim.mem_per_core_mb.get(part)
    return {"known": True, "partitions": list(lim.partitions), "default_partition": lim.default_partition,
            "qos": lim.account_qos.get(account.strip() or lim.default_account) or lim.allowed_qos,
            "default_qos": lim.default_qos, "accounts": list(lim.account_qos), "default_account": lim.default_account,
            "longest": longest, "why": why,
            "cores": cores, "memory_gb": memory_gb,
            "mem_per_core_gb": round(per_core / 1024, 2) if per_core else None, "gpu_caps": lim.gpu_caps(qos.strip()),
            "billing": _billing(hub().session(cluster).cfg, lim.billing_for(part, qos.strip()), part)}


def _billing(cfg, billing: dict | None, partition: str) -> dict | None:
    """A partition the cluster doesn't bill (Yale's public ones) costs nothing, whatever the QoS says."""
    if billing and not cfg.paid(partition):
        return {**billing, "factor": 0, "free": "partition"}
    return billing


@method("clusters.gpus")
def gpus(cluster: str) -> dict:
    """The GPU types this cluster offers, read from Slurm at the last login (known false: the docs' list)."""
    s = hub().session(cluster)
    lim = s.limits
    if lim and lim.gres:
        return {"known": True, "gpus": gpu_list.as_json(gpu_list.options(lim.gres, s.cfg.id))}
    return {"known": False, "gpus": gpu_list.as_json(gpu_list.from_docs(s.cfg.id))}


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
