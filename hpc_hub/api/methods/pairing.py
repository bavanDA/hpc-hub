"""Both sides of core/pairing.py. The desktop makes the QR code (pairing.make, like the GTK app's
connect/ui/phone_pair.py); the phone saves the logins (and the SSH key) from the code it scanned (pairing.apply)."""

import time

from ...core import pairing, ssh_keys
from ..hub import hub
from ..server import method
from .clusters import set_login


def svg(matrix: list[list[bool]]) -> str:
    """The QR squares as a small SVG, dark on light whatever the theme (cameras miss light on dark)."""
    n = len(matrix)
    dark = "".join(f"M{x} {y}h1v1h-1z" for y, row in enumerate(matrix) for x, on in enumerate(row) if on)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            f'<rect width="{n}" height="{n}" fill="#fff"/><path d="{dark}" fill="#000"/></svg>')


@method("pairing.make")
def make(clusters: list[str] | None = None, passwords: bool = True) -> dict:
    """A QR code with these clusters' saved logins (all of them when None) for HPC Hub on a phone. A cluster that
    takes keys (key_login) gets a new key for the phone instead of a password, added there over the connection,
    so it must be connected. Answers {text, matrix (rows of 0/1), svg, clusters (names), skipped, expires}."""
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
    text = pairing.code(pairing.Code(entries, seed if any(e.key for e in entries) else b""))
    squares = pairing.matrix(text)
    return {"text": text, "matrix": ["".join("1" if on else "0" for on in row) for row in squares],
            "svg": svg(squares), "clusters": [known[e.cluster].name for e in entries], "skipped": skipped,
            "expires": int(time.time()) + pairing.LIFETIME}


@method("pairing.apply")
def apply(code: str) -> list[str]:
    """Saves each login for a cluster this app has. Answers their names."""
    got = pairing.parse(code)
    known = {c.id: c for c in hub().clusters}
    entries = [e for e in got.entries if e.cluster in known]
    if not entries:
        raise pairing.PairingError("The code has no login for a cluster in this app.")
    if got.key:
        ssh_keys.save(got.key)
    for e in entries:
        cfg = known[e.cluster]
        set_login(cfg.id, "ssh", e.username, e.password or None, cfg.remember_password)
    return [known[e.cluster].name for e in entries]
