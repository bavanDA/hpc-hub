"""Set up the phone app from the desktop: the desktop shows your logins as a QR code, the phone scans it and saves
them in its own vault. Clusters that take SSH keys (key_login) get a key for the phone instead of a password
(ssh_keys.py). A VPN with a login of its own (Yale's) comes along. Nothing goes over the network. The code is short lived and shown only when you ask."""

import base64
import json
import time
from dataclasses import dataclass, field

from ..vendor.qrcodegen import QrCode
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
    key: bool = False  # the code's key opens this cluster
    vpn_user: str = ""  # the VPN's own login, when it has one
    vpn_password: str = ""


@dataclass
class Code:
    entries: list[Entry] = field(default_factory=list)
    key: bytes = b""  # the phone's SSH key (ssh_keys.SEED bytes), when an entry uses it


def saved(clusters: list[str], passwords: bool = True) -> list[Entry]:
    """The SSH logins saved for these clusters (those without one are left out), with their VPN logins."""
    out = []
    for cid in clusters:
        login = credentials.load(cid, credentials.SSH)
        if login and login.username:
            vpn = credentials.load(cid, credentials.VPN)
            vpn_user, vpn_pass = (vpn.username, vpn.password) if vpn and vpn.username else ("", "")
            out.append(Entry(cid, login.username, login.password if passwords else "", vpn_user=vpn_user,
                             vpn_password=vpn_pass if passwords else ""))
    return out


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _vpn(e: Entry) -> dict:
    if not e.vpn_user:
        return {}
    return {"vpn": {"user": e.vpn_user, **({"password": e.vpn_password} if e.vpn_password else {})}}


def code(c: Code, now: float | None = None) -> str:
    logins = {e.cluster: {"user": e.username, **({"password": e.password} if e.password and not e.key else {}),
                          **({"key": True} if e.key else {}), **_vpn(e)} for e in c.entries}
    body = {"exp": int((time.time() if now is None else now) + LIFETIME), "logins": logins,
            **({"key": _b64(c.key)} if c.key else {})}
    return PREFIX + _b64(json.dumps(body, separators=(",", ":")).encode())


def parse(text: str, now: float | None = None) -> Code:
    text = text.strip()
    if not text.startswith(PREFIX):
        raise PairingError("This is not an HPC Hub code. Open Set up the phone app on the desktop.")
    try:
        body = json.loads(_unb64(text[len(PREFIX):]))
        exp, logins = int(body["exp"]), body["logins"]
        key = _unb64(body["key"]) if body.get("key") else b""
        entries = [Entry(str(cid), str(v["user"]), str(v.get("password", "")), bool(v.get("key")),
                         str((v.get("vpn") or {}).get("user", "")), str((v.get("vpn") or {}).get("password", "")))
                   for cid, v in logins.items()]
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PairingError("The code could not be read. Show it again on the desktop.") from e
    if (time.time() if now is None else now) > exp:
        raise PairingError("This code is too old. Show a new one on the desktop.")
    return Code([e for e in entries if e.username], key)


def matrix(text: str, border: int = 4) -> list[list[bool]]:
    """The QR squares (True: dark), with the quiet border cameras need around them."""
    qr = QrCode.encode_text(text, QrCode.Ecc.MEDIUM)
    n = qr.get_size()
    return [[0 <= x < n and 0 <= y < n and qr.get_module(x, y) for x in range(-border, n + border)]
            for y in range(-border, n + border)]
