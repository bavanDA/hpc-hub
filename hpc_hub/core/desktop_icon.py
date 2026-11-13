"""Linux: install.sh copies the app's icon to ~/.local/share/icons/hpc-hub.png for the app menu and dock, but an
in-app update replaces only the AppImage. So at each start the AppImage puts its own icon there again when it
differs, and a new icon arrives with the update like everything else."""

import os
from pathlib import Path

INSIDE = "usr/share/icons/hicolor/128x128/apps/hpc-hub.png"  # where the AppImage has it (as install.sh reads it)


def refresh(appdir: str | None = None, home: Path | None = None) -> bool:
    """Copy the AppImage's icon over the menu's when they differ. Only when install.sh made that file: never
    creates one, never touches another app's. True when it changed."""
    appdir = appdir if appdir is not None else os.environ.get("APPDIR", "")
    if not appdir:
        return False
    target = (home or Path.home()) / ".local" / "share" / "icons" / "hpc-hub.png"
    source = Path(appdir) / INSIDE
    try:
        if not target.is_file() or target.is_symlink() or not source.is_file():
            return False
        new = source.read_bytes()
        if target.read_bytes() == new:
            return False
        tmp = target.with_name(".hpc-hub.png.new")
        tmp.write_bytes(new)
        tmp.replace(target)
        return True
    except OSError:
        return False  # an icon is never worth failing the start for
