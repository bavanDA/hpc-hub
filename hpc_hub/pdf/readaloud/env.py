"""edge-tts and PyMuPDF live in their own small Python environment, made on first use; the app's Python stays
untouched."""

import os
import subprocess
import sys
from pathlib import Path

PACKAGES = ["edge-tts==7.3.1",  # 7.2.8 now gets 403 from the service
            "pymupdf==1.28.2"]  # reading order of two-column papers


def clean() -> dict[str, str]:
    """This environment for the voice's own Python: without what the app's bundle sets for its Python and libraries
    (the AppImage's PYTHONHOME, PYTHONPATH and LD_LIBRARY_PATH), which stop any other Python from starting."""
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH")}
    bundle = os.environ.get("APPDIR") or getattr(sys, "_MEIPASS", "")
    if bundle and "LD_LIBRARY_PATH" in env:
        kept = [d for d in env["LD_LIBRARY_PATH"].split(":") if d and not d.startswith(bundle)]
        env["LD_LIBRARY_PATH"] = ":".join(kept)
        if not kept:
            del env["LD_LIBRARY_PATH"]
    return env


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
    subprocess.run(["python3", "-m", "venv", str(d)], check=True, capture_output=True, timeout=300, env=clean())
    res = subprocess.run([str(d / "bin" / "pip"), "install", "-q", *PACKAGES], capture_output=True, text=True,
                         env=clean(),
                         timeout=600)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "pip failed")
    (d / _marker()).touch()
    return d / "bin" / "python"
