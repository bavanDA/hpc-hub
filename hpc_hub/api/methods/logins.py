"""Logins kept in the keyring: usernames come out, passwords only go in."""

from ...connect import login_check
from ...core import credentials
from ...core.credentials import Login
from ..hub import hub
from ..server import method

KINDS = (credentials.SSH, credentials.VPN)


def _memory() -> dict:
    """Passwords of clusters set to "don't remember": (cluster, kind) -> password, until the app quits."""
    return hub().__dict__.setdefault("passwords", {})


def _unsaved(cfg, kind: str, login: Login) -> Login:
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
    return Login(login.username, _memory()[key])


def for_connect(cfg) -> tuple[Login, Login | None]:
    """The SSH and VPN logins to connect with: the VPN uses the SSH login or its own."""
    ssh = credentials.load(cfg.id, credentials.SSH)
    if not ssh or not ssh.username:
        raise ValueError(f"Add your {cfg.name} username in the cluster's settings first")
    ssh = _unsaved(cfg, credentials.SSH, Login(credentials.cluster_username(cfg.host, ssh.username), ssh.password))
    if not cfg.vpn.enabled:
        return ssh, None
    vpn = ssh if cfg.vpn.same_login_as_ssh else credentials.load(cfg.id, credentials.VPN)
    if vpn and not cfg.vpn.same_login_as_ssh:
        vpn = _unsaved(cfg, credentials.VPN, vpn)
    if vpn and not vpn.password:
        vpn = Login(vpn.username, ssh.password)
    if not vpn or not vpn.username:
        raise ValueError(f"Add your {cfg.name} VPN login in the cluster's settings first")
    return ssh, vpn


@method("clusters.login")
def login(cluster: str) -> dict:
    """The saved usernames, and whether a password is saved."""
    cfg = hub().session(cluster).cfg
    out = {}
    for kind in KINDS:
        saved = credentials.load(cfg.id, kind)
        out[kind] = {"username": saved.username if saved else "", "password": bool(saved and saved.password)}
    out["remember"] = cfg.remember_password
    return out


def _username(username: str) -> str:
    username = username.strip()
    if not username:
        raise ValueError("Username is empty")
    return username


def _save_username_only(cluster: str, kind: str, username: str, password: str | None) -> None:
    """The keyring keeps the username; a password typed now stays in memory."""
    username = _username(username)
    if password:
        _memory()[(cluster, kind)] = password
    saved = credentials.load(cluster, kind)
    if saved != Login(username, ""):
        credentials.save(cluster, kind, Login(username, ""))


def _save_with_password(cluster: str, kind: str, username: str, password: str | None) -> None:
    """An empty password keeps the saved one."""
    if kind not in KINDS:
        raise ValueError(f"No login kind {kind}")
    username = _username(username)
    saved = credentials.load(cluster, kind)
    password = password or (saved.password if saved else "")
    if saved != Login(username, password):
        credentials.save(cluster, kind, Login(username, password))


@method("clusters.set_login")
def set_login(cluster: str, kind: str, username: str, password: str | None = None, remember: bool = True) -> None:
    """Save a login. remember False: the password is asked once per run and kept in memory."""
    cfg = hub().session(cluster).cfg
    if kind not in KINDS:
        raise ValueError(f"No login kind {kind}")
    if kind == credentials.SSH:  # "ab123@njit.edu" for Wulver is ab123
        username = credentials.cluster_username(cfg.host, username)
    if cfg.remember_password != remember:
        cfg.remember_password = remember
        hub().save_clusters()
    save = _save_with_password if remember else _save_username_only
    save(cfg.id, kind, username, password)


@method("clusters.check_login")
def check_login(cluster: str, username: str, password: str = "") -> dict:
    """Whether this username and password work, before you connect (login_check.py: no Duo push). An empty
    password checks the saved one. {ok: True | False | None (can't tell from this network), text}."""
    cfg = hub().session(cluster).cfg
    username = credentials.cluster_username(cfg.host, username)
    if not username:
        raise ValueError("Username is empty")
    saved = credentials.load(cfg.id, credentials.SSH)
    return login_check.check(cfg, hub().askpass, username, password or (saved.password if saved else ""))


@method("clusters.forget_logins")
def forget_logins(cluster: str, keep_username: bool = False) -> None:
    """Remove the saved passwords; keep_username leaves the usernames."""
    cfg = hub().session(cluster).cfg
    for kind in KINDS:
        saved = credentials.load(cfg.id, kind) if keep_username else None
        credentials.clear(cfg.id, kind)
        _memory().pop((cfg.id, kind), None)
        if saved and saved.username:
            credentials.save(cfg.id, kind, Login(saved.username, ""))
