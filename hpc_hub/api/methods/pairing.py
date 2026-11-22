"""Both sides of core/pairing.py: the phone shows a one-time code, the desktop seals the QR code with it, and the
phone opens it with the code it showed and saves the logins."""

import threading
import time

from ...core import pairing, ssh_keys
from ..hub import hub
from ..server import method
from .logins import set_login

HELD = 1800  # seconds the phone keeps showing the same code: a cancelled scan tries again with what you typed
_held: dict = {}  # the phone's code and when it was made, in memory only: {"code", "at"}
_lock = threading.Lock()


def svg(matrix: list[list[bool]]) -> str:
    """The QR squares as a small SVG, dark on light whatever the theme (cameras miss light on dark)."""
    n = len(matrix)
    dark = "".join(f"M{x} {y}h1v1h-1z" for y, row in enumerate(matrix) for x, on in enumerate(row) if on)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            f'<rect width="{n}" height="{n}" fill="#fff"/><path d="{dark}" fill="#000"/></svg>')


@method("pairing.start")
def start() -> dict:
    """On the phone, before the camera opens: the code to type on the desktop, as XXXXX-XXXXX. It stays the same
    until a scan uses it or HELD seconds go by, and is never written down. Answers {code}."""
    now = time.time()
    with _lock:
        if not _held or now - _held["at"] > HELD:
            _held.update(code=pairing.phone_code(), at=now)
        return {"code": _held["code"]}


@method("pairing.make")
def make(code: str = "", clusters: list[str] | None = None, passwords: bool = True) -> dict:
    """A QR code with these clusters' saved logins (all of them when None) for HPC Hub on a phone, sealed with the
    code that phone shows (code, as typed). A cluster that takes keys (key_login) gets a new key for the phone
    instead of a password, added there over the connection, so it must be connected. Answers {text, matrix (rows
    of 0/1), svg, clusters (names), skipped, expires}."""
    pairing.normalize(code)  # a mistyped code is said before a key is added anywhere
    known = {c.id: c for c in hub().clusters}
    ids = [c for c in (clusters if clusters is not None else list(known)) if c in known]
    entries = pairing.saved(ids, passwords)
    skipped, seed = [], ssh_keys.new()
    line = ssh_keys.authorize_command(ssh_keys.public_line(seed))
    for e in list(entries):
        cfg = known[e.cluster]
        if not cfg.key_login:
            continue
        s = hub().session(e.cluster)
        why = "" if s.connected else "Connect it first, to add a key for the phone"
        if not why:
            try:
                res = s.ssh.run(line, timeout=30)
                why = (res.stderr.strip() or "Could not add the key") if res.returncode else ""
            except Exception as err:  # noqa: BLE001 - said next to the code
                why = str(err)
        if why:
            entries.remove(e)
            skipped.append({"cluster": cfg.id, "name": cfg.name, "reason": why})
        else:
            e.key = True
    if not entries:
        raise pairing.PairingError(skipped[0]["reason"] if skipped else "No saved logins yet. Sign in to a "
                                   "cluster here first.")
    text = pairing.code(pairing.Code(entries, seed if any(e.key for e in entries) else b""), code)
    squares = pairing.matrix(text)
    return {"text": text, "matrix": ["".join("1" if on else "0" for on in row) for row in squares],
            "svg": svg(squares), "clusters": [known[e.cluster].name for e in entries], "skipped": skipped,
            "expires": int(time.time()) + pairing.LIFETIME}


@method("pairing.apply")
def apply(code: str) -> list[str]:
    """On the phone: opens the scanned QR (code) with the code pairing.start showed, and saves each login for a
    cluster this app has. That shown code is then used up. Answers their names."""
    with _lock:
        held = _held.get("code", "")
    if not held:
        raise pairing.PairingError("This phone has no code waiting for the desktop. Tap Scan from your computer "
                                   "again, and type the code it shows on the desktop.")
    got = pairing.parse(code, held)
    known = {c.id: c for c in hub().clusters}
    entries = [e for e in got.entries if e.cluster in known]
    if not entries:
        raise pairing.PairingError("The code has no login for a cluster in this app.")
    if got.key:
        ssh_keys.save(got.key)
    for e in entries:
        cfg = known[e.cluster]
        set_login(cfg.id, "ssh", e.username, e.password or None, cfg.remember_password)
        if e.vpn_user:
            set_login(cfg.id, "vpn", e.vpn_user, e.vpn_password or None, cfg.remember_password)
    with _lock:
        if _held.get("code") == held:
            _held.clear()
    return [known[e.cluster].name for e in entries]
