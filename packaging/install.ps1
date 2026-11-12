# Installs or updates HPC Hub on Windows from the newest GitHub release, in one line:
#   irm https://github.com/bavanDA/hpc-hub/releases/latest/download/install.ps1 | iex
# It checks the download against the release's SHA256SUMS.txt, updates the copy you have the way it was installed
# (per user with the setup, or for everyone with the .msi), and keeps your logins and settings.
# For testing: HPCHUB_TAG=v0.2.0 picks a release, HPCHUB_DRYRUN=1 stops before installing,
# HPCHUB_LOCALAPPDATA reads another user's per-user install.

function Install-HpcHub {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'  # Windows PowerShell's progress bar makes downloads very slow
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 'Tls12'
    $releases = 'https://github.com/bavanDA/hpc-hub/releases'
    $byHand = "Download it from $releases instead."

    # the release: the newest, or the one asked for
    $api = 'https://api.github.com/repos/bavanDA/hpc-hub/releases/'
    $api += if ($env:HPCHUB_TAG) { "tags/$($env:HPCHUB_TAG)" } else { 'latest' }
    try { $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'hpc-hub-install' } }
    catch { Write-Error "Could not reach GitHub: $($_.Exception.Message) $byHand"; return }
    $version = $release.tag_name.TrimStart('v')
    $asset = { param($name) $release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1 }
    $setup = & $asset "HPC-Hub_${version}_windows_x64-setup.exe"
    $msi = & $asset "HPC-Hub_${version}_windows_x64.msi"
    $sums = & $asset 'SHA256SUMS.txt'
    if (-not $setup -or -not $sums) { Write-Error "Release $version has no Windows installer. $byHand"; return }

    # what is installed: for everyone (the .msi) or just for you (the setup)
    $uninstall = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    $machine = Get-ItemProperty $uninstall -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq 'HPC Hub' -and $_.WindowsInstaller -eq 1 } | Select-Object -First 1
    $local = if ($env:HPCHUB_LOCALAPPDATA) { $env:HPCHUB_LOCALAPPDATA } else { $env:LOCALAPPDATA }
    $userExe = Join-Path $local 'HPC Hub\hpc-hub.exe'
    $installed = if ($machine) { $machine.DisplayVersion }
                 elseif (Test-Path $userExe) { (Get-Item $userExe).VersionInfo.ProductVersion }
    $forEveryone = [bool]$machine
    if ($installed) {
        $who = if ($machine) { 'for everyone' } else { 'for you' }
        Write-Host "HPC Hub $installed is installed $who."
    }
    if ($installed -and [version]$installed -ge [version]$version) {
        Write-Host "HPC Hub $installed is the newest version. Nothing to do."
        return
    }

    # installed for everyone: only the .msi updates it (the setup would add a second copy, just for you)
    if ($forEveryone -and -not $msi) {
        Write-Error "HPC Hub is installed for everyone here, and release $version has no .msi to update it. $byHand"
        return
    }

    # download and check it against the release's list of checksums
    $file = if ($forEveryone) { $msi } else { $setup }
    $path = Join-Path $env:TEMP $file.name
    Write-Host "Downloading HPC Hub $version..."
    try {
        Invoke-WebRequest -Uri $file.browser_download_url -OutFile $path -UseBasicParsing
        $list = (Invoke-WebRequest -Uri $sums.browser_download_url -UseBasicParsing).Content
        if ($list -is [byte[]]) { $list = [Text.Encoding]::UTF8.GetString($list) }
    } catch { Write-Error "The download failed: $($_.Exception.Message) $byHand"; return }
    $want = $null
    foreach ($line in $list -split "`n") {
        $pattern = "^\s*([0-9a-fA-F]{64})\s+\*?$([regex]::Escape($file.name))\s*$"
        if ($line -match $pattern) { $want = $Matches[1].ToLower() }
    }
    $got = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLower()
    if (-not $want -or $want -ne $got) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Error "The download doesn't match the release's checksum, so it was not installed. $byHand"
        return
    }
    Write-Host 'Checked: the download matches the release.'

    $running = Get-Process -Name 'hpc-hub', 'hpc-hub-backend' -ErrorAction SilentlyContinue
    if ($env:HPCHUB_DRYRUN) {
        $how = if ($forEveryone) { 'the .msi, for everyone (asks for admin once)' } else { 'the setup, just for you' }
        $close = if ($running) { 'close HPC Hub, then ' } else { '' }
        Write-Host "Dry run: would ${close}install $version with $how, then start it."
        Write-Host "Downloaded to $path"
        return
    }
    if ($running) {
        Write-Host 'Closing HPC Hub to update it. Your work on the clusters keeps running.'
        $running | Stop-Process -Force
        Start-Sleep -Seconds 1
    }

    Write-Host "Installing HPC Hub $version..."
    $noAdmin = 'Windows asked for permission to update HPC Hub for everyone, and it was not given, so nothing ' +
               'changed. Run this again and click Yes.'
    try {
        if ($forEveryone) {
            $msiArgs = "/i `"$path`" /passive /norestart"
            $p = Start-Process msiexec.exe -ArgumentList $msiArgs -Verb RunAs -Wait -PassThru
        } else {
            $p = Start-Process $path -ArgumentList '/S' -Wait -PassThru
        }
    } catch {  # the admin prompt was declined (Win32 error 1223)
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Error $noAdmin
        return
    }
    Remove-Item $path -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -in 1602, 1223) { Write-Error $noAdmin; return }  # cancelled
    if ($p.ExitCode -notin 0, 3010) {  # 3010: installed, Windows wants a restart later
        Write-Error "The installer stopped with code $($p.ExitCode). $byHand"
        return
    }

    $exe = $userExe
    if ($forEveryone) {
        $exe = Join-Path $env:ProgramFiles 'HPC Hub\hpc-hub.exe'
        if ($machine.InstallLocation) { $exe = Join-Path $machine.InstallLocation.Trim('"') 'hpc-hub.exe' }
    }
    if (Test-Path $exe) { Start-Process $exe }
    Write-Host "HPC Hub $version is installed."
}

Install-HpcHub
