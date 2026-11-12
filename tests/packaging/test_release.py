"""packaging/release.py: the built files renamed for the release, and latest.json, which the app's updater reads."""

import importlib.util
import json
from pathlib import Path

# by its path: "packaging" is also the name of a library Python tools install
SCRIPT = Path(__file__).resolve().parents[2] / "packaging" / "release.py"
_spec = importlib.util.spec_from_file_location("release", SCRIPT)
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

BASE = "https://github.com/bavanDA/hpc-hub/releases/download/v0.2.1"


def built(tmp_path, names):
    for name in names:
        f = tmp_path / name
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"sig of {f.name}" if name.endswith(".sig") else "x")
    return tmp_path


def test_names_and_latest_json(tmp_path):
    src = built(tmp_path / "in", [
        "appimage/HPC Hub_0.2.1_amd64.AppImage", "appimage/HPC Hub_0.2.1_amd64.AppImage.sig",
        "deb/HPC Hub_0.2.1_amd64.deb", "rpm/HPC Hub-0.2.1-1.x86_64.rpm",
        "nsis/HPC Hub_0.2.1_x64-setup.exe", "nsis/HPC Hub_0.2.1_x64-setup.exe.sig",
        "msi/HPC Hub_0.2.1_x64_en-US.msi", "msi/HPC Hub_0.2.1_x64_en-US.msi.sig",
        "dmg/HPC Hub_0.2.1_aarch64.dmg", "macos/HPC Hub.app.tar.gz", "macos/HPC Hub.app.tar.gz.sig"])
    out = tmp_path / "out"
    latest = release.collect(src, out, "0.2.1", "Fixes", "2026-11-12T20:00:00Z")
    names = sorted(p.name for p in out.iterdir())
    assert "HPC-Hub_0.2.1_linux_x86_64.AppImage" in names and "HPC-Hub_0.2.1_windows_x64-setup.exe" in names
    assert "HPC-Hub_0.2.1_macos_apple-silicon.app.tar.gz" in names and "latest.json" in names
    assert "SHA256SUMS.txt" in names and not any(n.endswith(".sig") for n in names)  # signatures live in latest.json
    p = latest["platforms"]
    assert p["linux-x86_64"] == {"url": f"{BASE}/HPC-Hub_0.2.1_linux_x86_64.AppImage",
                                 "signature": "sig of HPC Hub_0.2.1_amd64.AppImage.sig"}
    assert p["windows-x86_64"]["url"].endswith("_windows_x64-setup.exe")  # NSIS by default
    assert p["windows-x86_64-msi"]["url"].endswith("_windows_x64.msi")
    assert p["darwin-aarch64"]["url"].endswith("_macos_apple-silicon.app.tar.gz")
    assert "linux-x86_64-deb" not in p  # no signature, so not offered as an update
    assert (latest["version"], latest["notes"]) == ("0.2.1", "Fixes")
    assert json.loads((out / "latest.json").read_text()) == latest


def test_a_missing_signature_for_a_platform_is_an_error_not_a_silent_gap(tmp_path):
    src = built(tmp_path / "in", ["appimage/HPC Hub_0.2.1_amd64.AppImage"])
    try:
        release.collect(src, tmp_path / "out", "0.2.1", "", "2026-11-12T20:00:00Z")
    except SystemExit as e:
        assert "no update signatures" in str(e)
    else:
        raise AssertionError("expected it to stop")


def test_the_windows_one_line_installer_goes_into_the_release(tmp_path):
    src = built(tmp_path / "in", ["nsis/HPC Hub_0.2.1_x64-setup.exe", "nsis/HPC Hub_0.2.1_x64-setup.exe.sig"])
    out = tmp_path / "out"
    release.collect(src, out, "0.2.1", "", "2026-11-12T20:00:00Z")
    script = (out / "install.ps1").read_text()
    assert "irm https://github.com/bavanDA/hpc-hub/releases/latest/download/install.ps1 | iex" in script
    assert "install.ps1" not in (out / "SHA256SUMS.txt").read_text()  # the list is for the installers it checks
