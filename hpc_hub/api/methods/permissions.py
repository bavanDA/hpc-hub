"""What Claude may run on a cluster without asking, and its passcode lock. settings.json never comes to the UI
(it can hold API keys): saving reads it again on the cluster and changes only our keys."""

import secrets

from ...agents import permissions
from ...agents.lock import remote as lock
from ...agents.lock.activity import recent
from ...agents.lock.qr import grouped, qr_png
from ...agents.permissions import ASKS, COMMANDS, GROUPS
from ..hub import hub
from ..server import method

_setups: dict[str, tuple[str, str]] = {}  # setup id: (cluster, secret), until the lock is on the cluster


def _json(name: str, p: permissions.Permissions, lock_status: dict) -> dict:
    implied = {"trash"} if p.trash else set()  # saved with the trash switch, not a command you ticked
    return {"name": name, "allowed": sorted(p.allowed - implied), "custom": [c for c in p.custom if c not in implied],
            "trash": p.trash, "ask": sorted(p.ask),
            "accept_edits": p.accept_edits,
            "groups": [{"title": t, "note": n, "commands": c} for t, n, c in GROUPS],
            "asks": [{"key": k, "label": label, "hint": COMMANDS[k]} for k, label in ASKS],
            "lock": {"set_up": bool(lock_status.get("set_up")), "locked": bool(lock_status.get("locked")),
                     "config": lock_status.get("config") or {}, "open": lock_status.get("open", 0),
                     "log": recent(lock_status.get("log") or [])}}


@method("permissions.get")
def get(cluster: str) -> dict:
    s = hub().connected(cluster)
    return _json(s.cfg.name, permissions.read(s.ssh), lock.status(s.ssh))


@method("permissions.save")
def save(cluster: str, allowed: list[str], trash: bool = True, ask: list[str] | None = None,
         accept_edits: bool = True, lock_config: dict | None = None) -> dict:
    """lock_config: minutes, tries, logout, scancel; only when the lock is set up."""
    s = hub().connected(cluster)
    p = permissions.read(s.ssh)  # fresh, so changes made meanwhile (a lock set up) are kept
    p.allowed = {c.strip() for c in allowed if c.strip() and c.strip() != "rm"}
    p.trash, p.accept_edits = trash, accept_edits
    p.ask = set(ask or []) & {k for k, _ in ASKS}
    permissions.save(s.ssh, p)
    if lock_config:
        c = lock_config
        minutes, tries = min(max(int(c.get("minutes", 10)), 0), 240), min(max(int(c.get("tries", 3)), 1), 10)
        lock.configure(s.ssh, minutes, tries, bool(c.get("logout", True)), bool(c.get("scancel", True)))
    return get(cluster)


@method("permissions.lock_start")
def lock_start(cluster: str) -> dict:
    """A new secret for your authenticator app. It stays here until lock_finish puts it on the cluster."""
    s = hub().connected(cluster)
    secret = lock.new_secret()
    sid = secrets.token_hex(8)
    _setups[sid] = (cluster, secret)
    uri = lock.otp_uri(secret, f"{s.ssh.username}@{s.cfg.id}")
    return {"id": sid, "key": grouped(secret), "qr": qr_png(uri)}


@method("permissions.lock_finish")
def lock_finish(id: str, code: str) -> None:
    if id not in _setups:
        raise ValueError("This setup expired. Start again")
    cluster, secret = _setups[id]
    if not lock.code_ok(secret, code):
        raise ValueError("That code doesn't match. Check the phone's clock and try again")
    lock.install(hub().connected(cluster).ssh, secret)
    _setups.pop(id, None)


@method("permissions.lock_cancel")
def lock_cancel(id: str) -> None:
    _setups.pop(id, None)


@method("permissions.lock_reset")
def lock_reset(cluster: str) -> None:
    lock.reset(hub().connected(cluster).ssh)


@method("permissions.lock_off")
def lock_off(cluster: str) -> None:
    lock.uninstall(hub().connected(cluster).ssh)
