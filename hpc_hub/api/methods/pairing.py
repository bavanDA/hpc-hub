"""The phone's side of core/pairing.py: save the logins from a scanned desktop code."""

from ...core import pairing
from ..hub import hub
from ..server import method
from .clusters import set_login


@method("pairing.apply")
def apply(code: str) -> list[str]:
    """Saves each login for a cluster this app has. Answers their names."""
    known = {c.id: c for c in hub().clusters}
    done = []
    for e in pairing.parse(code):
        cfg = known.get(e.cluster)
        if cfg:
            set_login(cfg.id, "ssh", e.username, e.password or None, cfg.remember_password)
            done.append(cfg.name)
    if not done:
        raise pairing.PairingError("The code has no login for a cluster in this app.")
    return done
