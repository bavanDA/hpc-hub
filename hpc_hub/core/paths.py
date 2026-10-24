import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASKPASS_BIN = ROOT / "bin" / "hpc-hub-askpass"
SSO_BIN = ROOT / "bin" / "hpc-hub-sso"


def runtime_dir() -> Path:
    base = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/hpc-hub-{os.getuid()}"
    path = Path(base) / "hpc-hub"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def log_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    path = Path(base) / "hpc-hub"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    return path


def web_dir() -> Path:
    """Cookies of the in-app sign-in pages, so Okta/Microsoft can remember you like a browser does."""
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    path = Path(base) / "hpc-hub" / "web"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path
