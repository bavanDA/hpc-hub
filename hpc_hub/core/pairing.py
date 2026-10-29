"""Set up the phone app from the desktop: the desktop shows your logins as a QR code, the phone scans it and saves
them in its own vault. Nothing goes over the network. The code is short lived and shown only when you ask."""

import base64
import json
import time
from dataclasses import dataclass

from . import credentials

PREFIX = "hpchub-pair:1:"
LIFETIME = 600  # seconds a code is good for: an old photo of the screen is refused


class PairingError(ValueError):
    pass


@dataclass
class Entry:
    cluster: str
    username: str
    password: str = ""


def code(clusters: list[str], passwords: bool = True, now: float | None = None) -> tuple[str, list[str]]:
    """The QR text for the SSH logins saved for these clusters, and the clusters it has (those with a login)."""
    logins = {}
    for cid in clusters:
        saved = credentials.load(cid, credentials.SSH)
        if saved and saved.username:
            logins[cid] = {"user": saved.username, **({"password": saved.password}
                                                      if passwords and saved.password else {})}
    body = {"exp": int((time.time() if now is None else now) + LIFETIME), "logins": logins}
    text = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode()).decode().rstrip("=")
    return PREFIX + text, list(logins)


def parse(text: str, now: float | None = None) -> list[Entry]:
    text = text.strip()
    if not text.startswith(PREFIX):
        raise PairingError("This is not an HPC Hub code. Open Set up the phone app on the desktop.")
    try:
        raw = text[len(PREFIX):]
        body = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        exp, logins = int(body["exp"]), body["logins"]
        entries = [Entry(str(cid), str(v["user"]), str(v.get("password", ""))) for cid, v in logins.items()]
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PairingError("The code could not be read. Show it again on the desktop.") from e
    if (time.time() if now is None else now) > exp:
        raise PairingError("This code is too old. Show a new one on the desktop.")
    return [e for e in entries if e.username]
