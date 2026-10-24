import os
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASKPASS_BIN = ROOT / "bin" / "hpc-hub-askpass"
SSO_BIN = ROOT / "bin" / "hpc-hub-sso"
WINDOWS = sys.platform == "win32"


def _windows_dir(var: str, fallback: str, *parts: str) -> Path:
    """%LOCALAPPDATA% or %APPDATA%: already private to you, so no owner or mode checks."""
    path = Path(os.environ.get(var) or Path.home() / "AppData" / fallback).joinpath("HPC Hub", *parts)
    path.mkdir(parents=True, exist_ok=True)
    return path


def runtime_dir() -> Path:
    """SSH sockets, the askpass socket, VPN cookies: a folder only you can enter. Checked, because the
    fallback is in /tmp, where another user could make it first. Windows: %LOCALAPPDATA%\\HPC Hub."""
    if WINDOWS:
        if os.environ.get("XDG_RUNTIME_DIR"):  # set by hand (tests)
            path = Path(os.environ["XDG_RUNTIME_DIR"]) / "hpc-hub"
            path.mkdir(parents=True, exist_ok=True)
            return path
        return _windows_dir("LOCALAPPDATA", "Local")
    base = Path(os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/hpc-hub-{os.getuid()}")
    path = base / "hpc-hub"
    for d in (base, path):
        d.mkdir(mode=0o700, exist_ok=True)
        st = os.lstat(d)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
            raise RuntimeError(f"{d} is not your own folder. Remove it and start HPC Hub again")
        os.chmod(d, 0o700)
    return path


def log_dir() -> Path:
    if WINDOWS and not os.environ.get("XDG_CACHE_HOME"):
        return _windows_dir("APPDATA", "Roaming", "logs")
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    path = Path(base) / "hpc-hub"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    return path


def web_dir() -> Path:
    """Cookies of the in-app sign-in pages, so Okta/Microsoft can remember you like a browser does."""
    if WINDOWS and not os.environ.get("XDG_DATA_HOME"):
        return _windows_dir("APPDATA", "Roaming", "web")
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    path = Path(base) / "hpc-hub" / "web"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path
