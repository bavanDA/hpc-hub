"""Passwords in a file encrypted with AES-GCM, for systems where the backend can reach no keyring (Android). The app
shell keeps the key in the system's key store and passes it as HPC_HUB_VAULT_KEY. The same calls as a keyring."""

import json
import os
import threading
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_ENV = "HPC_HUB_VAULT_KEY"
NONCE = 12

_lock = threading.Lock()


def default_path() -> Path:
    base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "hpc-hub"
    base.mkdir(mode=0o700, parents=True, exist_ok=True)
    return base / "vault.bin"


class FileVault:
    def __init__(self, path: Path | None = None, key: str | None = None):
        key = os.environ.get(KEY_ENV, "") if key is None else key
        try:
            self._aes = AESGCM(bytes.fromhex(key))
        except ValueError as e:
            raise RuntimeError("No safe place to keep passwords here (no vault key)") from e
        self.path = path or default_path()

    def _read(self) -> dict[str, str]:
        try:
            blob = self.path.read_bytes()
        except FileNotFoundError:
            return {}
        try:
            return json.loads(self._aes.decrypt(blob[:NONCE], blob[NONCE:], None))
        except (InvalidTag, ValueError):
            return {}  # made with another key (the phone's key store lost it): start empty

    def _write(self, data: dict[str, str]) -> None:
        nonce = os.urandom(NONCE)
        blob = nonce + self._aes.encrypt(nonce, json.dumps(data).encode(), None)
        tmp = self.path.with_name(self.path.name + ".tmp")
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as f:
            f.write(blob)
        os.replace(tmp, self.path)

    def get_password(self, service: str, account: str) -> str | None:
        with _lock:
            return self._read().get(f"{service}/{account}")

    def set_password(self, service: str, account: str, secret: str) -> None:
        with _lock:
            data = self._read()
            data[f"{service}/{account}"] = secret
            self._write(data)

    def delete_password(self, service: str, account: str) -> None:
        """Nothing saved is fine."""
        with _lock:
            data = self._read()
            if data.pop(f"{service}/{account}", None) is not None:
                self._write(data)
