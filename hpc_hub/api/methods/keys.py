"""This computer's SSH key, for clusters you log in to with one (core/my_key.py): show it, make it, test it."""

from ...core import login_copy, my_key
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
    """Try a login with only the key and no prompts. {ok, text, kind}."""
    cfg = hub().session(cluster).cfg
    key = my_key.find()
    if not key:
        return my_key.Result(False, login_copy.TEST_NO_KEY).json()
    if not username.strip():
        return my_key.Result(False, login_copy.TEST_NO_USER).json()
    return my_key.test(key, username.strip(), cfg.host, cfg.port, cfg.who, cfg.vpn_owner).json()
