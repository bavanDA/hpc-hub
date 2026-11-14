"""Linux: the app menu and dock show the icon install.sh set up, but an in-app update replaces only the AppImage. So at
each start the AppImage puts its own icon in the user's icon theme (~/.local/share/icons/hicolor/.../hpc-hub.png),
where the desktop looks it up by name and notices a change. A GNOME that showed an icon from a file path keeps that
picture until you log out, so a menu entry install.sh made with the old path (before 0.2.5) moves to the name."""

import os
from pathlib import Path

INSIDE = "usr/share/icons/hicolor/128x128/apps/hpc-hub.png"  # where the AppImage has it (as install.sh reads it)
THEMED = Path(".local/share/icons/hicolor/128x128/apps/hpc-hub.png")  # under home: the icon theme's copy
OLD = Path(".local/share/icons/hpc-hub.png")  # under home: where install.sh put it before 0.2.5
ENTRY = Path(".local/share/applications/hpc-hub.desktop")  # under home: install.sh's menu entry


def refresh(appdir: str | None = None, home: Path | None = None) -> bool:
    """Bring this AppImage's icon to the menu. Only for an install made by install.sh (its menu entry is there):
    never touches another app's files. True when something changed."""
    appdir = appdir if appdir is not None else os.environ.get("APPDIR", "")
    home = home or Path.home()
    entry = home / ENTRY
    source = Path(appdir) / INSIDE if appdir else None
    try:
        if not source or not source.is_file() or not entry.is_file() or entry.is_symlink():
            return False
        new = source.read_bytes()
        changed = _put(home / THEMED, new)
        if changed:
            os.utime(home / ".local/share/icons/hicolor")  # tells the desktop the theme changed
        old = home / OLD
        if old.is_file() and not old.is_symlink():
            changed |= _put(old, new)
        text = entry.read_text()
        lines = [("Icon=hpc-hub" if line == f"Icon={old}" else line) for line in text.splitlines()]
        if "\n".join(lines) + "\n" != text:
            _write(entry, ("\n".join(lines) + "\n").encode())
            changed = True
        return changed
    except OSError:
        return False  # an icon is never worth failing the start for


def _put(path: Path, data: bytes) -> bool:
    if path.is_symlink() or (path.is_file() and path.read_bytes() == data):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    _write(path, data)
    return True


def _write(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.new")
    tmp.write_bytes(data)
    tmp.replace(path)
