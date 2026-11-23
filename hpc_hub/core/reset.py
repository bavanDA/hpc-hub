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

# Windows process flags. Never DETACHED_PROCESS: PowerShell started without a console quits at once, before it
# runs anything (2026-11-22: Reset HPC Hub on Windows removed nothing for that reason). CREATE_NO_WINDOW gives it a
# hidden console of its own instead; breaking away from the app's job keeps it alive when the app's processes end.
NO_WINDOW, NEW_GROUP, BREAKAWAY = 0x08000000, 0x00000200, 0x01000000
REMOVE_TRIES = 30  # seconds a locked file (a WebView2 process still closing) gets before the remover gives up


def parent_of(pid: int) -> int | None:
    """The process that started pid, while both run; None when it can't be told."""
    try:
        if WINDOWS:
            import ctypes
            from ctypes import wintypes

            class Entry(ctypes.Structure):
                _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                            ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                            ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                            ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
                            ("dwFlags", wintypes.DWORD), ("szExeFile", ctypes.c_wchar * 260)]

            k32 = ctypes.WinDLL("kernel32", use_last_error=True)
            k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
            snap = k32.CreateToolhelp32Snapshot(0x2, 0)  # TH32CS_SNAPPROCESS
            if not snap or snap == wintypes.HANDLE(-1).value:
                return None
            try:
                e = Entry()
                e.dwSize = ctypes.sizeof(Entry)
                ok = k32.Process32FirstW(snap, ctypes.byref(e))
                while ok:
                    if e.th32ProcessID == pid:
                        return int(e.th32ParentProcessID) or None
                    ok = k32.Process32NextW(snap, ctypes.byref(e))
            finally:
                k32.CloseHandle(snap)
            return None
        if MAC:
            out = subprocess.run(["ps", "-o", "ppid=", "-p", str(pid)], capture_output=True, text=True, timeout=5)
            return int(out.stdout.strip()) or None
        stat = Path(f"/proc/{pid}/stat").read_text()
        return int(stat[stat.rindex(")") + 2:].split()[1]) or None
    except (OSError, ValueError, subprocess.SubprocessError, AttributeError):
        return None


def app_processes() -> list[int]:
    """The processes to wait for: this backend, the process that started it and the app itself. A frozen backend
    is two processes (PyInstaller's bootloader starts the Python one), so the app is the parent's parent; the
    app's own process id, when the window passes it (HPC_HUB_APP_PID), is used first."""
    own, parent = os.getpid(), os.getppid()
    told = os.environ.get("HPC_HUB_APP_PID", "")
    app = int(told) if told.isdigit() else (parent_of(parent) if getattr(sys, "frozen", False) else None)
    return list(dict.fromkeys(p for p in (app, parent, own) if p))


def windows_script(paths: list[Path], then: list[str], wait: list[int]) -> str:
    """The PowerShell that waits for the app (and its WebView2 processes, which hold its browser data open) to end,
    removes paths, trying again while files are still locked, and then runs then. What it couldn't remove is
    written to %TEMP%\\hpc-hub-reset.log."""
    quoted = ", ".join("'" + str(p).replace("'", "''") + "'" for p in paths)
    ids = ", ".join(str(int(p)) for p in wait)
    lines = [
        # one at a time: those already gone are skipped, the rest still waited for
        f"foreach ($id in @({ids})) {{ Wait-Process -Id $id -Timeout 120 -ErrorAction SilentlyContinue }}",
        # the window's WebView2 processes close a moment after it; they name its data folder on their command line
        "$deadline = (Get-Date).AddSeconds(20)",
        "while ((Get-Date) -lt $deadline -and (Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" "
        f"-ErrorAction SilentlyContinue | Where-Object {{ $_.CommandLine -like '*{IDENTIFIER}*' }})) "
        "{ Start-Sleep -Milliseconds 500 }",
        "Start-Sleep -Seconds 1",
    ]
    if paths:
        lines += [
            f"$paths = @({quoted})",
            f"for ($i = 0; $i -lt {REMOVE_TRIES}; $i++) {{",
            "  $left = @($paths | Where-Object { Test-Path -LiteralPath $_ })",
            "  if (-not $left) { break }",
            "  $left | ForEach-Object { Remove-Item -LiteralPath $_ -Recurse -Force -ErrorAction SilentlyContinue }",
            "  if (@($paths | Where-Object { Test-Path -LiteralPath $_ })) { Start-Sleep -Seconds 1 }",
            "}",
            "$left = @($paths | Where-Object { Test-Path -LiteralPath $_ })",
            "$log = Join-Path $env:TEMP 'hpc-hub-reset.log'",
            "if ($left) { \"$(Get-Date -Format s) not removed: $($left -join ', ')\" | Add-Content -LiteralPath $log } "
            "else { \"$(Get-Date -Format s) removed: $($paths -join ', ')\" | Add-Content -LiteralPath $log }",
        ]
    if then:
        lines.append("Start-Process -FilePath '" + then[0].replace("'", "''") + "'")
    return "\n".join(lines) + "\n"


def _start_windows(script: str) -> None:
    """PowerShell, hidden, apart from the app: out of its job when Windows allows that."""
    import base64
    argv = ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
            "-EncodedCommand", base64.b64encode(script.encode("utf-16-le")).decode()]
    for flags in (NO_WINDOW | NEW_GROUP | BREAKAWAY, NO_WINDOW | NEW_GROUP):
        try:
            subprocess.Popen(argv, creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
            return
        except OSError:  # the job allows no breakaway: started inside it, which still outlives the app's quit
            if not flags & BREAKAWAY:
                raise


def after_quit(paths: list[Path], then: list[str], app_pid: int | None = None) -> None:
    """Start a process, apart from the app, that waits for it to quit, then removes paths and runs then."""
    for p in paths:
        if not (_ours(p) or p.suffix == ".AppImage" or p.name in ("hpc-hub.desktop", "hpc-hub.png",
                                                                    ".hpc-hub-version")):
            raise ResetError(f"Refusing to remove {p}: it isn't HPC Hub's")
    wait = [app_pid] if app_pid is not None else app_processes()
    if WINDOWS:
        _start_windows(windows_script(paths, then, wait))
        return
    alive = " || ".join(f"kill -0 {int(p)} 2>/dev/null" for p in wait) or "false"
    script = (f"i=0; while {{ {alive}; }} && [ $i -lt 240 ]; do sleep 0.5; i=$((i+1)); done; sleep 1; "
              + (f"rm -rf -- {shlex.join(str(p) for p in paths)}; " if paths else "")
              + (shlex.join(then) if then else "true"))
    subprocess.Popen(["/bin/sh", "-c", script], start_new_session=True, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def shown(p: Path) -> str:
    """A path as the window shows it: ~ for your home folder."""
    home = str(Path.home())
    s = str(p)
    return "~" + s[len(home):] if s.startswith(home) else s
