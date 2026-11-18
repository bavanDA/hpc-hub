"""Reset HPC Hub (forget what it saved on this computer) and uninstall it.

What it saved: logins in the system keyring (each cluster's SSH and VPN password, Globus), its settings
(~/.config/hpc-hub), its logs and caches, the sign-in pages' cookies, and the window's own browser data. Never
touched: your SSH keys and known hosts in ~/.ssh (other programs use them), and anything on the clusters.

Folders are removed after the app has quit, by a small process left behind for that: the app keeps writing its
settings and logs until it closes. Every folder is checked to be HPC Hub's own before it is removed."""

import os
import shlex
import subprocess
import sys
from pathlib import Path

from . import credentials
from .config import CONFIG_DIR
from .paths import WINDOWS, log_dir, resources_dir, web_dir

IDENTIFIER = "local.hpchub.HpcHub"  # app/src-tauri/tauri.conf.json: the window's browser data is kept under it
OURS = {"hpc-hub", "HPC Hub", IDENTIFIER}  # the only folder names this removes
MAC = sys.platform == "darwin"


class ResetError(RuntimeError):
    pass


def _window_data() -> list[Path]:
    """The window's browser data (cookies of portal pages, its storage), where Tauri's webview keeps it."""
    home = Path.home()
    if WINDOWS:
        local = Path(os.environ.get("LOCALAPPDATA") or home / "AppData" / "Local")
        roaming = Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming")
        return [local / IDENTIFIER, roaming / IDENTIFIER]
    if MAC:
        lib = home / "Library"
        return [lib / "WebKit" / IDENTIFIER, lib / "Caches" / IDENTIFIER, lib / "Application Support" / IDENTIFIER]
    data = Path(os.environ.get("XDG_DATA_HOME") or home / ".local" / "share")
    cache = Path(os.environ.get("XDG_CACHE_HOME") or home / ".cache")
    return [data / IDENTIFIER, cache / IDENTIFIER]


def places() -> list[Path]:
    """HPC Hub's own folders on this computer, which a reset removes."""
    found = [CONFIG_DIR, log_dir(), web_dir().parent, *_window_data()]
    if WINDOWS:  # logs and sign-in cookies share %APPDATA%\HPC Hub
        found = [p for p in found if p.name in OURS]
    out: list[Path] = []
    for p in found:
        if p not in out:
            out.append(p)
    return [p for p in out if _ours(p)]


def _ours(path: Path) -> bool:
    """Only a folder named for HPC Hub, below your home folder, never your home itself."""
    home = Path.home().resolve()
    try:
        real = path.resolve()
    except OSError:
        return False
    return path.name in OURS and real != home and home in real.parents


def forget_logins(cluster_ids: list[str]) -> int:
    """Remove the saved passwords and tokens from the system keyring. Returns how many kinds were cleared."""
    from ..globus.api import KEY as GLOBUS
    done = 0
    for key in [*((c, k) for c in cluster_ids for k in (credentials.SSH, credentials.VPN)), GLOBUS]:
        try:
            credentials.clear(*key)
            done += 1
        except Exception:  # noqa: BLE001  one the keyring can't remove doesn't stop the rest
            pass
    return done


# -- uninstall ------------------------------------------------------------------------------------------

def _linux_app() -> list[Path]:
    """The AppImage install.sh put in place, its menu entry, icon and version note."""
    image = os.environ.get("APPIMAGE", "")
    if not image.endswith(".AppImage") or not Path(image).is_file():
        raise ResetError("This HPC Hub wasn't installed as an AppImage, so remove it the way you installed it "
                         "(for example with your package manager).")
    app = Path(image)
    share = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return [app, app.parent / ".hpc-hub-version", share / "applications" / "hpc-hub.desktop",
            share / "icons" / "hicolor" / "128x128" / "apps" / "hpc-hub.png"]


def _windows_uninstaller() -> Path:
    """The uninstaller the Windows installer left in the app's folder."""
    for folder in (resources_dir(), Path(os.environ.get("LOCALAPPDATA") or "") / "HPC Hub"):
        if folder and (folder / "uninstall.exe").is_file():
            return folder / "uninstall.exe"
    raise ResetError("The Windows uninstaller wasn't found. Remove HPC Hub in Settings > Apps.")


def _mac_bundle() -> Path:
    here = resources_dir() or Path(sys.executable)
    for p in [here, *here.parents]:
        if p.suffix == ".app":
            return p
    raise ResetError("HPC Hub isn't running from its app, so there's nothing to move to the Trash.")


def uninstall_step() -> tuple[list[Path], list[str]]:
    """What removes the app itself after it quits: files to delete, and a command to run (Windows' uninstaller,
    or moving the app to the Trash). Raises ResetError, before anything is removed, when it can't."""
    if WINDOWS:
        return [], [str(_windows_uninstaller())]
    if MAC:
        bundle = _mac_bundle()
        script = f'tell application "Finder" to delete POSIX file "{bundle}"'
        return [], ["osascript", "-e", script]
    return _linux_app(), []


def remove_vpn_helper(log) -> None:
    """The VPN helper (Windows and macOS) runs as a system service: removing it asks for permission, like setting
    it up did. Refused or failed, the rest still goes ahead."""
    from ..connect import vpn_helper
    if not vpn_helper.needs_helper() or vpn_helper.installed_version() is None:
        return
    program = vpn_helper.helper_program()
    try:
        if WINDOWS:
            code = vpn_helper._run_as_admin_windows(program, ["uninstall"])
        else:
            line = shlex.join([str(program), "uninstall"])
            script = f'do shell script "{vpn_helper._applescript(line)}" with administrator privileges'
            code = subprocess.run(["osascript", "-e", script], capture_output=True, timeout=300).returncode
    except (OSError, subprocess.SubprocessError):
        code = 1
    log("VPN helper removed" if code == 0 else "The VPN helper was left in place (permission was not given)")


# -- after the app quits --------------------------------------------------------------------------------

def after_quit(paths: list[Path], then: list[str], app_pid: int | None = None) -> None:
    """Start a process, apart from the app, that waits for it to quit, then removes paths and runs then."""
    for p in paths:
        if not (_ours(p) or p.suffix == ".AppImage" or p.name in ("hpc-hub.desktop", "hpc-hub.png",
                                                                    ".hpc-hub-version")):
            raise ResetError(f"Refusing to remove {p}: it isn't HPC Hub's")
    pid = app_pid if app_pid is not None else os.getppid()
    if WINDOWS:
        quoted = ", ".join("'" + str(p).replace("'", "''") + "'" for p in paths)
        run = "Start-Process -FilePath '" + then[0].replace("'", "''") + "'" if then else ""
        script = (f"Wait-Process -Id {pid} -Timeout 120 -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; "
                  + (f"Remove-Item -LiteralPath {quoted} -Recurse -Force -ErrorAction SilentlyContinue; "
                     if paths else "") + run)
        subprocess.Popen(["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
                         creationflags=0x00000008 | 0x00000200 | 0x08000000,  # detached, own group, no window
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    script = (f"i=0; while kill -0 {pid} 2>/dev/null && [ $i -lt 240 ]; do sleep 0.5; i=$((i+1)); done; sleep 1; "
              + (f"rm -rf -- {shlex.join(str(p) for p in paths)}; " if paths else "")
              + (shlex.join(then) if then else "true"))
    subprocess.Popen(["/bin/sh", "-c", script], start_new_session=True, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def shown(p: Path) -> str:
    """A path as the window shows it: ~ for your home folder."""
    home = str(Path.home())
    s = str(p)
    return "~" + s[len(home):] if s.startswith(home) else s
