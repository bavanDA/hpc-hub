import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASKPASS_BIN = ROOT / "bin" / "hpc-hub-askpass"


def runtime_dir() -> Path:
    base = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/hpc-hub-{os.getuid()}"
    path = Path(base) / "hpc-hub"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path
