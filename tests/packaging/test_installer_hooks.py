"""The Windows installer's hook (app/src-tauri/windows/hooks.nsh): HPC Hub's programs still running from the install
folder are stopped before files are copied (2026-11-23: "Error opening file for writing: ...hpc-hub-backend.exe",
and Ignore left the old backend in place). Tried on Windows 11 with a folder named O'Hub test: the copy in it was
stopped and replaced, one in another folder kept running."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAURI = ROOT / "app" / "src-tauri"


def hook() -> str:
    conf = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))
    path = TAURI / conf["bundle"]["windows"]["nsis"]["installerHooks"]
    return path.read_text(encoding="utf-8")


def test_the_installer_runs_the_hook_before_copying():
    text = hook()
    assert "!macro NSIS_HOOK_PREINSTALL" in text and "!macroend" in text
    assert text.count("Push $0") == 1 and text.count("Pop $0") == 2  # nsExec's answer, then $0 as it was


def test_it_stops_the_backend_and_openconnect_from_the_install_folder_only():
    text = hook()
    assert "'hpc-hub-backend.exe', 'openconnect.exe'" in text
    assert "ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase)" in text
    assert "Stop-Process -Id $$x.ProcessId -Force" in text and "Wait-Process" in text
    # a 32-bit installer can't read a 64-bit process's path with Get-Process: Win32_Process gives it
    assert "Get-CimInstance Win32_Process" in text and "Get-Process" not in text


def test_the_folder_goes_through_the_environment_never_the_command():
    text = hook()
    assert 'SetEnvironmentVariable(t "HPCHUB_INSTDIR", t "$INSTDIR")' in text
    command = text[text.index("nsExec::Exec"):]
    command = command[:command.index("\n")]
    assert "$INSTDIR" not in command and "$$env:HPCHUB_INSTDIR" in command
