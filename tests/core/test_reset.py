import os
import sys
import time
from pathlib import Path

import pytest

from hpc_hub.core import credentials, reset


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A made-up home with HPC Hub's folders and some that aren't its."""
    h = tmp_path / "home" / "jdoe"
    for d in (".config/hpc-hub", ".cache/hpc-hub", ".local/share/hpc-hub/web", ".local/share/local.hpchub.HpcHub",
              ".ssh", ".config/other-app"):
        (h / d).mkdir(parents=True)
    (h / ".ssh" / "id_ed25519").write_text("key")
    monkeypatch.setattr(Path, "home", lambda: h)
    for var in ("XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(reset, "CONFIG_DIR", h / ".config" / "hpc-hub")
    monkeypatch.setattr(reset, "log_dir", lambda: h / ".cache" / "hpc-hub")
    monkeypatch.setattr(reset, "web_dir", lambda: h / ".local" / "share" / "hpc-hub" / "web")
    monkeypatch.setattr(reset, "WINDOWS", False)
    monkeypatch.setattr(reset, "MAC", False)
    return h


def test_a_reset_removes_only_hpc_hubs_folders(home):
    got = {reset.shown(p).replace("\\", "/") for p in reset.places()}  # Windows shows ~\\.cache\\hpc-hub
    assert {"~/.config/hpc-hub", "~/.cache/hpc-hub", "~/.local/share/hpc-hub",
            "~/.local/share/local.hpchub.HpcHub"} <= got
    assert not any(".ssh" in g or "other-app" in g for g in got)


def test_never_outside_the_home_or_the_home_itself(home):
    assert not reset._ours(home)
    assert not reset._ours(Path("/etc/hpc-hub"))
    assert not reset._ours(home / ".ssh")
    with pytest.raises(reset.ResetError, match="isn't HPC Hub's"):
        reset.after_quit([home / ".ssh"], [], app_pid=0)


@pytest.mark.skipif(sys.platform == "win32", reason="the Windows remover is PowerShell")
def test_folders_go_after_the_app_quits(home):
    places = reset.places()
    reset.after_quit(places, [], app_pid=999999999)  # no such process: it has quit
    for _ in range(60):
        if not any(p.exists() for p in places):
            break
        time.sleep(0.1)
    assert not any(p.exists() for p in places)
    assert (home / ".ssh" / "id_ed25519").exists() and (home / ".config" / "other-app").exists()


def test_logins_are_forgotten_for_every_cluster_and_globus(monkeypatch):
    cleared = []
    monkeypatch.setattr(credentials, "clear", lambda *key: cleared.append(key))
    assert reset.forget_logins(["wulver", "yale"]) == 5
    assert ("wulver", "ssh") in cleared and ("yale", "vpn") in cleared and ("globus", "tokens") in cleared


def test_uninstall_on_linux_needs_the_appimage(home, monkeypatch):
    monkeypatch.delenv("APPIMAGE", raising=False)
    with pytest.raises(reset.ResetError, match="package manager"):
        reset.uninstall_step()
    app = home / "Applications" / "HPC-Hub.AppImage"
    app.parent.mkdir()
    app.write_text("")
    monkeypatch.setenv("APPIMAGE", str(app))
    files, then = reset.uninstall_step()
    assert app in files and then == []
    assert home / ".local" / "share" / "applications" / "hpc-hub.desktop" in files


def test_uninstall_on_windows_runs_its_uninstaller(home, monkeypatch, tmp_path):
    monkeypatch.setattr(reset, "WINDOWS", True)
    monkeypatch.setattr(reset, "resources_dir", lambda: tmp_path / "app")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "none"))
    with pytest.raises(reset.ResetError, match="Settings > Apps"):
        reset.uninstall_step()
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "uninstall.exe").write_text("")
    assert reset.uninstall_step() == ([], [str(tmp_path / "app" / "uninstall.exe")])


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX paths")
def test_uninstall_on_a_mac_moves_the_app_to_the_trash(home, monkeypatch):
    monkeypatch.setattr(reset, "MAC", True)
    monkeypatch.setattr(reset, "resources_dir", lambda: Path("/Applications/HPC Hub.app/Contents/Resources"))
    files, then = reset.uninstall_step()
    assert files == [] and then[0] == "osascript" and '"/Applications/HPC Hub.app"' in then[2]


def test_shown_uses_a_tilde(home):
    assert reset.shown(home / ".config" / "hpc-hub") == "~" + os.sep.join(["", ".config", "hpc-hub"])


# -- Windows: the remover must really run (2026-11-22: Reset HPC Hub removed nothing on Windows) -----------------

def _decoded(argv: list[str]) -> str:
    import base64
    return base64.b64decode(argv[argv.index("-EncodedCommand") + 1]).decode("utf-16-le")


def test_the_windows_remover_is_never_started_detached(home, monkeypatch):
    """PowerShell started with DETACHED_PROCESS has no console and quits before it runs anything."""
    started = []
    monkeypatch.setattr(reset, "WINDOWS", True)
    monkeypatch.setattr(reset.subprocess, "Popen", lambda argv, **kw: started.append((argv, kw)))
    reset.after_quit(reset.places(), [], app_pid=4242)
    (argv, kw), = started
    flags = kw["creationflags"]
    assert not flags & 0x00000008, "DETACHED_PROCESS"
    assert flags & reset.NO_WINDOW and flags & reset.BREAKAWAY
    assert argv[0] == "powershell" and "-NonInteractive" in argv
    assert "Remove-Item" in _decoded(argv)


def test_inside_a_job_that_allows_no_breakaway_it_starts_without(home, monkeypatch):
    tries = []

    def popen(argv, creationflags=0, **kw):
        tries.append(creationflags)
        if creationflags & reset.BREAKAWAY:
            raise PermissionError(5, "Access is denied")

    monkeypatch.setattr(reset, "WINDOWS", True)
    monkeypatch.setattr(reset.subprocess, "Popen", popen)
    reset.after_quit(reset.places(), [], app_pid=4242)
    assert len(tries) == 2 and tries[0] & reset.BREAKAWAY and not tries[1] & reset.BREAKAWAY
    assert not any(t & 0x8 for t in tries)


def test_the_windows_script_waits_for_every_process_and_the_windows_browser():
    script = reset.windows_script([Path(r"C:\Users\jdoe\AppData\Roaming\HPC Hub")], [], [11, 22, 33])
    assert "foreach ($id in @(11, 22, 33)) { Wait-Process -Id $id" in script
    assert "msedgewebview2.exe" in script and f"*{reset.IDENTIFIER}*" in script
    assert script.index("Wait-Process") < script.index("msedgewebview2") < script.index("Remove-Item")


def test_the_windows_script_tries_again_while_files_are_locked_and_says_what_was_left():
    script = reset.windows_script([Path(r"C:\Users\jdoe\it's mine\HPC Hub")], [], [1])
    assert f"for ($i = 0; $i -lt {reset.REMOVE_TRIES}; $i++)" in script
    assert "'C:\\Users\\jdoe\\it''s mine\\HPC Hub'" in script  # a quote in a path is doubled, not a break-out
    assert "hpc-hub-reset.log" in script and "not removed:" in script


def test_the_uninstaller_runs_after_the_folders_are_gone():
    exe = r"C:\Program Files\HPC Hub\uninstall.exe"
    script = reset.windows_script([Path(r"C:\Users\jdoe\.config\hpc-hub")], [exe], [1])
    assert script.index("Remove-Item") < script.index(f"Start-Process -FilePath '{exe}'")
    only = reset.windows_script([], [r"C:\x\uninstall.exe"], [1])
    assert "Remove-Item" not in only and "Start-Process" in only


def test_the_app_is_waited_for_not_only_pyinstallers_bootloader(monkeypatch):
    """A frozen backend's parent is PyInstaller's bootloader; the app (whose WebView2 holds files open) is above it."""
    monkeypatch.delenv("HPC_HUB_APP_PID", raising=False)
    monkeypatch.setattr(reset.os, "getpid", lambda: 300)
    monkeypatch.setattr(reset.os, "getppid", lambda: 200)
    monkeypatch.setattr(reset, "parent_of", lambda pid: {200: 100}.get(pid))
    monkeypatch.setattr(reset.sys, "frozen", True, raising=False)
    assert reset.app_processes() == [100, 200, 300]
    monkeypatch.setenv("HPC_HUB_APP_PID", "77")
    assert reset.app_processes() == [77, 200, 300]
    monkeypatch.delenv("HPC_HUB_APP_PID")
    monkeypatch.setattr(reset.sys, "frozen", False)
    assert reset.app_processes() == [200, 300]  # python -m hpc_hub.api: the parent is the app


def test_parent_of_finds_this_tests_own_parent():
    """The real lookup on the system the tests run on (Toolhelp on Windows, /proc on Linux, ps on macOS)."""
    assert reset.parent_of(os.getpid()) == os.getppid()
    assert reset.parent_of(2**31 - 7) is None


@pytest.mark.skipif(sys.platform == "win32", reason="the Windows remover is PowerShell")
def test_folders_wait_for_every_app_process(home):
    import subprocess
    places = [p for p in reset.places() if p.exists()]
    assert len(places) >= 3
    sleeper = subprocess.Popen(["sleep", "2"])  # the app, still closing
    import unittest.mock as mock
    with mock.patch.object(reset, "app_processes", lambda: [sleeper.pid, 999999999]):
        reset.after_quit(places, [])
    time.sleep(1)
    assert all(p.exists() for p in places), "removed while the app still ran"
    sleeper.wait()
    for _ in range(60):
        if not any(p.exists() for p in places):
            break
        time.sleep(0.1)
    assert not any(p.exists() for p in places)
