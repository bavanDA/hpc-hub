"""This computer's SSH key, for clusters you log in to with one (core/my_key.py): show it, make it, test it."""

from ...core import my_key
from ..hub import hub
from ..server import method


@method("keys.mine")
def mine() -> dict | None:
    key = my_key.find()
    return key.json() if key else None


@method("keys.create")
def create() -> dict:
    """A new key, unless there is one: then that one (yours is never replaced)."""
    key = my_key.find()
    return (key or my_key.create()).json()


@method("keys.test")
def test(cluster: str, username: str) -> dict:
    """Try a sign-in with only the key and no prompts. {ok, text, kind, reason, last}. The screen only asks once
    there are a key and a username."""
    cfg = hub().session(cluster).cfg
    key = my_key.find()
    if not key or not username.strip():
        raise ValueError("Make a key and type your username first")
    return my_key.test(key, username.strip(), cfg.host, cfg.port, cfg.who, cfg.vpn.enabled).json()
