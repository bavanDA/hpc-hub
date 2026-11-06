"""The last chat list per picker, kept on this computer: reading the chats can take seconds on a cold cluster
file system (7 s on Wulver), so the picker shows this at once and swaps in the fresh list."""

import hashlib
import json
import os
from dataclasses import asdict

from ..core.paths import log_dir
from .chats import Chat


def _file(key: str):
    folder = log_dir() / "chats"
    folder.mkdir(mode=0o700, exist_ok=True)
    return folder / (hashlib.sha256(key.encode()).hexdigest()[:24] + ".json")


def remember(key: str, chats: list[Chat], extra: dict | None = None) -> None:
    """Readable only by you: it holds titles and first lines of your chats."""
    path = _file(key)
    tmp = path.with_suffix(".tmp")
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"chats": [asdict(c) for c in chats], **(extra or {})}, f)
    tmp.replace(path)


def recall(key: str) -> tuple[list[Chat], dict] | None:
    try:
        data = json.loads(_file(key).read_text())
        return [Chat(**c) for c in data.pop("chats")], data
    except (OSError, ValueError, TypeError, KeyError):
        return None
