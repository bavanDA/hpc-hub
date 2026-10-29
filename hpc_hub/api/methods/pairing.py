"""The phone's side of core/pairing.py: save the logins (and the SSH key) from a scanned desktop code."""

from ...core import pairing, ssh_keys
from ..hub import hub
from ..server import method
from .clusters import set_login


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
