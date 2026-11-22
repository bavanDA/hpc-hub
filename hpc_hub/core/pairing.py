"""The QR code that moves your logins from the desktop to the phone, offline and short lived. Clusters that take
SSH keys get a key for the phone instead of a password (ssh_keys.py).

The phone shows a one-time code first (phone_code), you type it on the desktop, and the QR is sealed with it, so a
photo of the desktop's screen alone gives nothing away. Version 2 is PREFIX + urlsafe base64 of salt (16 bytes),
nonce (12 bytes) and the AES-GCM ciphertext of the JSON body, with the key from Scrypt over the code and the prefix
as associated data. Version 1 (plain base64 JSON) is refused."""

import base64
import json
import re
import secrets
import time
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from ..vendor.qrcodegen import QrCode
from . import credentials

PREFIX = "hpchub-pair:2:"
OLD_PREFIX = "hpchub-pair:1:"  # not sealed: a desktop from before the phone code
LIFETIME = 600  # seconds a code is good for: an old photo of the screen is refused
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford's base32: no I, L, O or U to mix up
CODE_LENGTH = 10  # 50 random bits, and Scrypt makes each guess slow
SALT, NONCE, TAG = 16, 12, 16
WRONG_CODE = ("This code was made for another phone code. Type the code shown on this phone on the desktop "
              "again.")
UNREADABLE = "The code could not be read. Show it again on the desktop."


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


def phone_code() -> str:
    """A new one-time code for the phone to show, as XXXXX-XXXXX."""
    raw = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return f"{raw[:5]}-{raw[5:]}"


def normalize(typed: str) -> str:
    """The code as typed (any case, with spaces or dashes, O for 0, I or L for 1) as its ten characters."""
    raw = re.sub(r"[\s\-‐-―−]", "", str(typed)).upper().translate(str.maketrans("OIL", "011"))
    if len(raw) != CODE_LENGTH:
        raise PairingError(f"The phone code has {CODE_LENGTH} letters and digits, like 7K2QM-X9D4R, and this one has "
                           f"{len(raw)}. It is on the phone, after you tap Scan from your computer.")
    if bad := sorted({ch for ch in raw if ch not in ALPHABET}):
        raise PairingError(f"The phone code has no {', '.join(bad)}. Check it on the phone and type it again.")
    return raw


def _key(phone: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(normalize(phone).encode())


def code(c: Code, phone: str, now: float | None = None) -> str:
    """The QR text for these logins, sealed with the code the phone shows (normalize says when it's mistyped)."""
    logins = {e.cluster: {"user": e.username, **({"password": e.password} if e.password and not e.key else {}),
                          **({"key": True} if e.key else {}), **_vpn(e)} for e in c.entries}
    body = {"exp": int((time.time() if now is None else now) + LIFETIME), "logins": logins,
            **({"key": _b64(c.key)} if c.key else {})}
    salt, nonce = secrets.token_bytes(SALT), secrets.token_bytes(NONCE)
    sealed = AESGCM(_key(phone, salt)).encrypt(nonce, json.dumps(body, separators=(",", ":")).encode(),
                                               PREFIX.encode())
    return PREFIX + _b64(salt + nonce + sealed)


def parse(text: str, phone: str, now: float | None = None) -> Code:
    """The logins in a scanned QR, opened with the code this phone showed."""
    text = text.strip()
    if text.startswith(OLD_PREFIX):
        raise PairingError("This code is from an older HPC Hub on the desktop. Update HPC Hub there, then open Set "
                           "up the phone app again.")
    if not text.startswith(PREFIX):
        if text.startswith("hpchub-pair:"):
            raise PairingError("This code is from a newer HPC Hub on the desktop. Update the phone app.")
        raise PairingError("This is not an HPC Hub code. Open Set up the phone app on the desktop.")
    try:
        blob = _unb64(text[len(PREFIX):])
    except ValueError as e:
        raise PairingError(UNREADABLE) from e
    if len(blob) < SALT + NONCE + TAG:
        raise PairingError(UNREADABLE)
    salt, nonce, sealed = blob[:SALT], blob[SALT:SALT + NONCE], blob[SALT + NONCE:]
    try:
        plain = AESGCM(_key(phone, salt)).decrypt(nonce, sealed, PREFIX.encode())
    except InvalidTag as e:  # another phone's code, a mistyped one, or a changed QR: all the same from here
        raise PairingError(WRONG_CODE) from e
    try:
        body = json.loads(plain)
        exp, logins = int(body["exp"]), body["logins"]
        key = _unb64(body["key"]) if body.get("key") else b""
        entries = [Entry(str(cid), str(v["user"]), str(v.get("password", "")), bool(v.get("key")),
                         str((v.get("vpn") or {}).get("user", "")), str((v.get("vpn") or {}).get("password", "")))
                   for cid, v in logins.items()]
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise PairingError(UNREADABLE) from e
    if (time.time() if now is None else now) > exp:
        raise PairingError("This code is too old. Show a new one on the desktop.")
    return Code([e for e in entries if e.username], key)


def matrix(text: str, border: int = 4) -> list[list[bool]]:
    """The QR squares (True: dark), with the quiet border cameras need around them."""
    qr = QrCode.encode_text(text, QrCode.Ecc.MEDIUM)
    n = qr.get_size()
    return [[0 <= x < n and 0 <= y < n and qr.get_module(x, y) for x in range(-border, n + border)]
            for y in range(-border, n + border)]
