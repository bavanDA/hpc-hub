"""Check a typed username and password before the first connect, so a typo shows at once (first start, Settings).

The password is sent once; the question that comes next tells whether it was right. A second password question
means it wasn't; Duo, an authenticator code or a finished login mean it was. Duo is never answered, so no push
goes to the phone. The check uses its own SSH socket, so a real connection to the cluster is never touched."""

from dataclasses import replace

from ..core.config import ClusterConfig
from ..core.ssh import SshError, new_master
from . import prompts
from .messages import plain, wrong_password
from .network import reachable

TIMEOUT = 45


def check(cfg: ClusterConfig, askpass, username: str, password: str) -> dict:
    """{ok: True} it works, {ok: False, text} the password was refused, {ok: None, text} can't tell (no password,
    the cluster out of reach, any other failure): the first start goes on and the real connect says more."""
    if not password:
        return {"ok": None, "text": "No password to check yet, so your login is checked when you connect."}
    if not reachable(cfg.host, cfg.port or 22):
        how = " without the VPN" if cfg.vpn.enabled else ""
        return {"ok": None, "text": f"Can't reach {cfg.name} from this network{how}, so your login is checked when "
                                    "you connect."}
    seen = {"passwords": 0, "past": False}

    def on_prompt(prompt: str) -> str | None:
        if prompts.classify(prompt) == prompts.PASSWORD:
            seen["passwords"] += 1
            return password if seen["passwords"] == 1 else None  # asked again: it was wrong, stop before a lockout
        seen["past"] = seen["passwords"] > 0  # a question after the password (Duo, a code): it was right
        return None

    token = askpass.register(on_prompt)
    master = new_master(replace(cfg, id=f"{cfg.id}-check"), username, askpass.env(token), lambda line: None,
                        ask=on_prompt)
    try:
        master.start(timeout=TIMEOUT)
        return {"ok": True, "text": ""}  # no second step: logged in
    except (SshError, OSError) as e:
        failed = str(e)
    finally:
        askpass.unregister(token)
        master.stop()
    if seen["past"]:
        return {"ok": True, "text": ""}
    if seen["passwords"] > 1:
        return {"ok": False, "text": wrong_password(cfg, username)}
    return {"ok": None, "text": plain(failed, cfg)}
