"""edge-tts and PyMuPDF live in their own small Python environment, made on first use; the app's Python stays
untouched."""

import os
import subprocess
from pathlib import Path

PACKAGES = ["edge-tts==7.3.1",  # 7.2.8 now gets 403 from the service
            "pymupdf==1.28.2"]  # reading order of two-column papers


def folder() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "hpc-hub" / "tts"


def python() -> Path | None:
    py = folder() / "bin" / "python"
    return py if (folder() / _marker()).exists() and py.exists() else None


def _marker() -> str:
    return ".ok-" + "+".join(PACKAGES)


def install() -> Path:
    """Blocking (about half a minute the first time)."""
    d = folder()
    subprocess.run(["python3", "-m", "venv", str(d)], check=True, capture_output=True, timeout=300)
    res = subprocess.run([str(d / "bin" / "pip"), "install", "-q", *PACKAGES], capture_output=True, text=True,
                         timeout=600)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "pip failed")
    (d / _marker()).touch()
    return d / "bin" / "python"
