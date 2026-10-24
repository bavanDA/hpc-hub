"""Freeze the backend with PyInstaller and put it where Tauri looks for its sidecar:
app/src-tauri/binaries/hpc-hub-backend-<target triple>[.exe].

    pip install -r packaging/requirements-backend.txt
    python packaging/build_backend.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "build" / "pyinstaller"
BINARIES = ROOT / "app" / "src-tauri" / "binaries"


def target() -> str:
    """Tauri names sidecars by the Rust target, so ask rustc for it."""
    out = subprocess.run(["rustc", "-vV"], capture_output=True, text=True, check=True).stdout
    return next(line.split(":", 1)[1].strip() for line in out.splitlines() if line.startswith("host:"))


def main() -> None:
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
                    "--distpath", str(WORK / "dist"), "--workpath", str(WORK / "build"),
                    str(ROOT / "packaging" / "backend.spec")], check=True)
    exe = ".exe" if sys.platform == "win32" else ""
    BINARIES.mkdir(parents=True, exist_ok=True)
    dest = BINARIES / f"hpc-hub-backend-{target()}{exe}"
    shutil.copy2(WORK / "dist" / f"hpc-hub-backend{exe}", dest)
    print(dest)


if __name__ == "__main__":
    main()
