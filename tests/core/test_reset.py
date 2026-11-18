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
