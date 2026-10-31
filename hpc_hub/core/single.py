"""One HPC Hub at a time. The GTK app and the new app share SSH connections, VPN profiles and logs; two of them
logging in at once fight over Duo and the clusters answer "Permission denied"."""

from .paths import runtime_dir

try:
    import fcntl
except ImportError:  # Windows
    import msvcrt
    fcntl = None

MESSAGE = "Another HPC Hub is open. Close it, then open this one again."
_held = None  # the open lock file; the lock lasts as long as this process


def _lock(f) -> None:
    """OSError if another process holds it."""
    if fcntl:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    else:
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)  # the first byte, even past the end of the file


def take() -> bool:
    """True if this process is now the only HPC Hub. The lock goes away by itself when the process ends."""
    global _held
    if _held is not None:
        return True
    f = open(runtime_dir() / "app.lock", "a")  # not "w": that would empty a file someone else holds
    try:
        _lock(f)
    except OSError:
        f.close()
        return False
    _held = f
    return True
