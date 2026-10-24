"""One HPC Hub at a time. The GTK app and the new app share SSH connections, VPN profiles and logs; two of them
logging in at once fight over Duo and the clusters answer "Permission denied"."""

from .paths import runtime_dir

try:
    import fcntl
except ImportError:  # Windows: the GTK app doesn't run there, so there is nothing to guard against
    fcntl = None

MESSAGE = "Another HPC Hub is open. Close it, then open this one again."
_held = None  # the open lock file; the lock lasts as long as this process


def take() -> bool:
    """True if this process is now the only HPC Hub. The lock goes away by itself when the process ends."""
    global _held
    if fcntl is None or _held is not None:
        return True
    f = open(runtime_dir() / "app.lock", "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return False
    _held = f
    return True
