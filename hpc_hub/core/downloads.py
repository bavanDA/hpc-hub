"""Where files from a cluster land to be opened here (Downloads/HPC Hub/<cluster>), and opening them.

Chosen here rather than by the window: Tauri finds no Downloads folder when the system's own setting names the home
folder itself (XDG_DOWNLOAD_DIR="$HOME/", which the XDG rules read as "none"), so it could neither save nor open."""

import os
import re
import subprocess
import sys
from pathlib import Path

APP_FOLDER = "HPC Hub"
XDG_LINE = re.compile(r'^\s*XDG_DOWNLOAD_DIR\s*=\s*"(.*)"\s*$', re.M)


def downloads(home: Path | None = None, platform: str = sys.platform, env=os.environ) -> Path:
    """This computer's Downloads folder: on Linux the one the desktop names (even the home folder itself),
    else ~/Downloads."""
    home = home or Path.home()
    if platform.startswith("linux"):
        config = Path(env.get("XDG_CONFIG_HOME") or home / ".config") / "user-dirs.dirs"
        try:
            m = XDG_LINE.search(config.read_text(errors="replace"))
        except OSError:
            m = None
        if m and m.group(1).strip():
            named = Path(m.group(1).replace("$HOME", str(home)).rstrip("/") or "/")
            if named.is_dir():
                return named
    return home / "Downloads"


def cluster_folder(cluster: str, **kw) -> Path:
    """Downloads/HPC Hub/<cluster>, made if needed."""
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", cluster) or "cluster"
    folder = downloads(**kw) / APP_FOLDER / safe
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def inside_app_folder(path: Path, **kw) -> bool:
    try:
        return path.resolve().is_relative_to((downloads(**kw) / APP_FOLDER).resolve())
    except OSError:
        return False


def open_here(path: str) -> None:
    """Open a file that came from a cluster with this computer's own app for it (a page: the browser). Only files
    under Downloads/HPC Hub: this is not a way to start any program."""
    p = Path(path)
    if not inside_app_folder(p) or not p.exists():
        raise ValueError(f"Not a file HPC Hub saved: {path}")
    if sys.platform == "win32":
        os.startfile(str(p))  # noqa: S606 - the file's own app, as a double click would
        return
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    subprocess.Popen([opener, str(p)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, start_new_session=True)


def show_here(path: str) -> None:
    """Show a file HPC Hub saved in this computer's file manager: picked out in its folder on Windows and macOS,
    its folder opened on Linux. Only files under Downloads/HPC Hub, as for open_here."""
    p = Path(path)
    if not inside_app_folder(p) or not p.exists():
        raise ValueError(f"Not a file HPC Hub saved: {path}")
    if sys.platform == "win32":
        argv = ["explorer", "/select,", str(p)]  # the path apart from /select,: so a space in it still works
    elif sys.platform == "darwin":
        argv = ["open", "-R", str(p)]
    else:
        argv = ["xdg-open", str(p.parent)]
    subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=sys.platform != "win32")
