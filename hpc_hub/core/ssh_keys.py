"""This device's own SSH key, made the first time it is needed (the phone has no ssh-keygen). A portal adds its
public half to your account (keysetup.py); the asyncssh login then finds the key in ~/.ssh by itself."""

import os
from pathlib import Path

COMMENT = "hpc-hub-phone"


def key_path() -> Path:
    return Path.home() / ".ssh" / "id_ed25519"


def ensure() -> str:
    """The public key line, after making the key if there is none."""
    key = key_path()
    pub = key.with_name(key.name + ".pub")
    if not key.exists():
        import asyncssh

        made = asyncssh.generate_private_key("ssh-ed25519", comment=COMMENT)
        key.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(made.export_private_key())
        pub.write_bytes(made.export_public_key())
    return pub.read_text().strip()
