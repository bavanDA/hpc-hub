"""The phone's SSH key. The desktop makes it, adds its public half to the clusters that take keys, and puts it in
the QR code (pairing.py); the phone keeps it in ~/.ssh, where the asyncssh login finds it by itself.
One phone at a time: a new key replaces the last one on the cluster (they share COMMENT)."""

import os
import shlex
from pathlib import Path

COMMENT = "hpc-hub-phone"
SEED = 32  # bytes of an Ed25519 private key


def key_path() -> Path:
    return Path.home() / ".ssh" / "id_ed25519"


def new() -> bytes:
    return os.urandom(SEED)


def _key(seed: bytes):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    return Ed25519PrivateKey.from_private_bytes(seed)


def public_line(seed: bytes) -> str:
    from cryptography.hazmat.primitives import serialization as s
    return _key(seed).public_key().public_bytes(s.Encoding.OpenSSH, s.PublicFormat.OpenSSH).decode() + " " + COMMENT


def save(seed: bytes) -> None:
    """On the phone: the key from the code, in place of the one there was."""
    from cryptography.hazmat.primitives import serialization as s
    key = key_path()
    key.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = key.with_name(key.name + ".tmp")
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as f:
        f.write(_key(seed).private_bytes(s.Encoding.PEM, s.PrivateFormat.OpenSSH, s.NoEncryption()))
    os.replace(tmp, key)
    key.with_name(key.name + ".pub").write_text(public_line(seed) + "\n")


def authorize_command(line: str) -> str:
    """Shell for the cluster: drop the last phone key from authorized_keys, add this one. Written back in place,
    so the file keeps its permissions."""
    return (f"umask 077; mkdir -p ~/.ssh; f=~/.ssh/authorized_keys; t=$f.hpchub; touch \"$f\"; "
            f"grep -v ' {COMMENT}$' \"$f\" > \"$t\"; "
            f"[ -s \"$t\" ] && [ -n \"$(tail -c1 \"$t\")\" ] && echo >> \"$t\"; "
            f"echo {shlex.quote(line)} >> \"$t\" && cat \"$t\" > \"$f\" && rm -f \"$t\"")
