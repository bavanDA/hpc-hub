"""This computer's SSH key, for clusters you log in to with one (core/my_key.py): show it, make it, test it."""

from ...core import my_key, pairing
from ..hub import hub
from ..server import method
from .pairing import svg


def _chosen(cluster: str) -> str:
    return hub().session(cluster).cfg.ssh_key if cluster else ""


@method("keys.mine")
def mine(cluster: str = "") -> dict | None:
    """The key this cluster signs in with: the one you picked for it, else the one ssh finds by itself."""
    key = my_key.find(_chosen(cluster))
    return key.json() if key else None


@method("keys.create")
def create() -> dict:
    """A new key, unless there is one: then that one (yours is never replaced)."""
    key = my_key.find()
    return (key or my_key.create()).json()


@method("keys.qr")
def qr(cluster: str = "") -> str | None:
    """The public key this cluster signs in with as a QR code (SVG), so a computer can read it off the phone."""
    key = my_key.find(_chosen(cluster))
    return svg(pairing.matrix(key.public)) if key else None


@method("keys.use")
def use(cluster: str, path: str, temporary: bool = False) -> dict:
    """Sign in to this cluster with a key you already have (its private key file). Saved with the cluster.
    temporary: the file picker's copy (the phone), which is kept in ~/.ssh first."""
    key = my_key.load(my_key.adopt(path) if temporary else path)
    hub().session(cluster).cfg.ssh_key = key.path
    hub().save_clusters()
    return key.json()


@method("keys.test")
def test(cluster: str, username: str) -> dict:
    """Try a sign-in with only the key and no prompts. {ok, text, kind, reason, last}. The screen only asks once
    there are a key and a username."""
    cfg = hub().session(cluster).cfg
    key = my_key.find(cfg.ssh_key)
    if not key or not username.strip():
        raise ValueError("Make a key and type your username first")
    result = my_key.test(key, username.strip(), cfg.host, cfg.port, cfg.who, cfg.vpn.enabled)
    if result.reason == "no_ssh":
        result = my_key.test_asyncssh(key, username.strip(), cfg)
    return result.json()
