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
    """Try a login with only the key and no prompts. {ok, text}."""
    cfg = hub().session(cluster).cfg
    key = my_key.find()
    if not key:
        return {"ok": False, "text": "Make your key first."}
    if not username.strip():
        return {"ok": False, "text": "Type your username first."}
    r = my_key.test(key, username.strip(), cfg.host, cfg.port, cfg.org or cfg.short_name, cfg.vpn.enabled)
    return {"ok": r.ok, "text": r.text}
