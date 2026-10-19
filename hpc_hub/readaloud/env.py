"""edge-tts lives in its own small Python environment, made on first use; the app's Python stays untouched."""

import os
import subprocess
from pathlib import Path

PACKAGE = "edge-tts==7.3.1"  # 7.2.8 now gets 403 from the service


def folder() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "hpc-hub" / "tts"


def python() -> Path | None:
    py = folder() / "bin" / "python"
    return py if (folder() / f".ok-{PACKAGE}").exists() and py.exists() else None


def install() -> Path:
    """Blocking (about half a minute the first time)."""
    d = folder()
    subprocess.run(["python3", "-m", "venv", str(d)], check=True, capture_output=True, timeout=300)
    res = subprocess.run([str(d / "bin" / "pip"), "install", "-q", PACKAGE], capture_output=True, text=True,
                         timeout=600)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "pip failed")
    (d / f".ok-{PACKAGE}").touch()
    return d / "bin" / "python"
