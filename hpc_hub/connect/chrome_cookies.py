"""Read one cookie from a Chrome profile on Linux, so a VPN sign-in done in your own browser can be used.

Chrome keeps cookies in <profile>/Cookies (SQLite), encrypted with a key from GNOME Keyring.
"""

import hashlib
import shutil
import sqlite3
import tempfile
import time
from pathlib import Path

import gi

gi.require_version("Secret", "1")
from gi.repository import Secret  # noqa: E402

from ..core.browser import CHROME_DIRS  # noqa: E402

SCHEMA = Secret.Schema.new("chrome_libsecret_os_crypt_password_v2", Secret.SchemaFlags.DONT_MATCH_NAME,
                           {"application": Secret.SchemaAttributeType.STRING})
EPOCH_1601 = 11644473600  # seconds between 1601 (Chrome's clock) and 1970


def chrome_time(unix: float) -> int:
    return int((unix + EPOCH_1601) * 1_000_000)


def _key(password: str) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    return PBKDF2HMAC(hashes.SHA1(), 16, b"saltysalt", 1).derive(password.encode())


def decrypt(value: bytes, host: str, keyring_password: str) -> str:
    """v11: keyring key, v10: Chrome's fixed fallback. Newer Chrome puts sha256(host) in front."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    prefix, body = value[:3], value[3:]
    key = _key(keyring_password if prefix == b"v11" else "peanuts")
    d = Cipher(algorithms.AES(key), modes.CBC(b" " * 16)).decryptor()
    out = d.update(body) + d.finalize()
    out = out[:-out[-1]]
    if out[:32] == hashlib.sha256(host.encode()).digest():
        out = out[32:]
    return out.decode()


def _matches(host_key: str, host: str) -> bool:
    return host_key == host or (host_key.startswith(".") and (host == host_key[1:] or host.endswith(host_key)))


def read(profile_folder: str, host: str, name: str, since: float = 0) -> str:
    """The newest cookie `name` for `host` set after `since` (unix time), or ''."""
    db = next((d / profile_folder / "Cookies" for d in CHROME_DIRS if (d / profile_folder / "Cookies").exists()), None)
    if not db:
        return ""
    with tempfile.TemporaryDirectory() as tmp:  # Chrome keeps the file open: read a copy
        copy = Path(tmp) / "Cookies"
        shutil.copy(db, copy)
        if db.with_name("Cookies-journal").exists():
            shutil.copy(db.with_name("Cookies-journal"), Path(tmp) / "Cookies-journal")
        con = sqlite3.connect(copy)
        try:
            rows = con.execute("SELECT host_key, value, encrypted_value FROM cookies WHERE name = ? AND "
                               "creation_utc > ? ORDER BY creation_utc DESC",
                               (name, chrome_time(since))).fetchall()
        finally:
            con.close()
    rows = [r for r in rows if _matches(r[0], host)]
    if not rows:
        return ""
    host_key, plain, encrypted = rows[0]
    if plain:
        return plain
    password = Secret.password_lookup_sync(SCHEMA, {"application": "chrome"}, None) or ""
    return decrypt(encrypted, host_key, password)


def wait_for(profile_folder: str, host: str, name: str, since: float, cancelled, timeout: float = 600) -> str:
    """Blocking: look every 2 s until the cookie shows up (Chrome saves cookies to disk every ~30 s)."""
    end = time.monotonic() + timeout
    while time.monotonic() < end and not cancelled():
        try:
            value = read(profile_folder, host, name, since)
        except (OSError, sqlite3.Error, UnicodeDecodeError, ValueError):
            value = ""
        if value:
            return value
        time.sleep(2)
    return ""
