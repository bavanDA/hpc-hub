"""The last calls that failed, kept in memory only, for a bug report: when, which method, the message and its
traceback. Each gets a ref the UI keeps with the error it shows, so Report sends that call's traceback."""

import itertools
import threading
import time
from collections import deque

SIZE = 30

_lock = threading.Lock()
_failed: deque[dict] = deque(maxlen=SIZE)
_refs = itertools.count(1)


def note(method: str, message: str, trace: str) -> int:
    with _lock:
        ref = next(_refs)
        _failed.append({"ref": ref, "at": time.time(), "method": method, "message": message, "trace": trace})
    return ref


def find(ref: int) -> dict | None:
    with _lock:
        return next((f for f in _failed if f["ref"] == ref), None)


def failed() -> list[dict]:
    """Oldest first."""
    with _lock:
        return list(_failed)


def clear() -> None:
    with _lock:
        _failed.clear()
