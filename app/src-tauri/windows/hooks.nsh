; HPC Hub's installer hooks (tauri.conf.json bundle.windows.nsis.installerHooks).
;
; Before any file is copied: stop HPC Hub's own programs that still run from the install folder. The installer
; checks only for the app's window; hpc-hub-backend.exe (its second process, its ssh bridges) and the VPN's
; openconnect.exe can outlive it, and Windows can't replace a running .exe. The installer then said "Error opening
; file for writing: ...\hpc-hub-backend.exe", and Ignore left the old backend next to the new app (2026-11-23: a
; quick fix then wouldn't install, "a file it shouldn't: fix.json"). Only programs whose file is in $INSTDIR are
; stopped (another copy of HPC Hub elsewhere is left alone); the folder goes through the environment, so a quote in
; it can't change the command. Win32_Process gives every process's path to a 32-bit installer too.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "HPCHUB_INSTDIR", t "$INSTDIR")i.r0'
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = [IO.Path]::GetFullPath($$env:HPCHUB_INSTDIR).TrimEnd('\') + '\'; $$p = @(Get-CimInstance Win32_Process | Where-Object { @('hpc-hub-backend.exe', 'openconnect.exe') -contains $$_.Name -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) }); foreach ($$x in $$p) { Stop-Process -Id $$x.ProcessId -Force -ErrorAction SilentlyContinue }; if ($$p) { Wait-Process -Id $$p.ProcessId -Timeout 15 -ErrorAction SilentlyContinue }"`
  Pop $0
  Pop $0
!macroend
