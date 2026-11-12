# Install and update

Install HPC Hub on your own computer. Nothing needs to be installed on the cluster.

## Windows 10 and 11

Open PowerShell and run:

```
irm https://github.com/bavanDA/hpc-hub/releases/latest/download/install.ps1 | iex
```

This downloads the newest HPC Hub installer from GitHub, checks it against the release's checksums, installs it
and opens the app. Running it again updates an existing install.

To install by hand, open the [releases page](https://github.com/bavanDA/hpc-hub/releases), download
the Windows `-setup.exe` under **Assets** and run it. If Windows shows **Windows
protected your PC**, select **More info**, then **Run anyway**.

## macOS

The macOS build is for Macs with Apple silicon. Open **Terminal** and run:

```
curl -fsSL https://github.com/bavanDA/hpc-hub/releases/latest/download/install.sh | sh
```

This downloads HPC Hub from GitHub, checks it against the release's checksums, puts it in **Applications** and
opens it. Running it again updates an existing install.

To install by hand, download the `.dmg` from the [releases page](https://github.com/bavanDA/hpc-hub/releases), open it
and drag HPC Hub to **Applications**. If macOS blocks it, open **System Settings**, then **Privacy & Security**, and
select **Open Anyway**.

## Linux

For x86\_64 computers. Open a terminal and run:

```
curl -fsSL https://github.com/bavanDA/hpc-hub/releases/latest/download/install.sh | sh
```

This puts the AppImage in `~/Applications`, adds HPC Hub to your app menu and opens it. It needs no `sudo`, and the
app updates itself from then on. The VPN also needs `openconnect` from your distribution; the command tells you
how to install it if it's missing.

To install by hand, download a build from the [releases page](https://github.com/bavanDA/hpc-hub/releases):

- **AppImage**: `chmod +x HPC-Hub_*_linux_x86_64.AppImage`, then run it.
- **Ubuntu or Debian**: `sudo apt install ./HPC-Hub_*_linux_amd64.deb`
- **Fedora or RHEL**: `sudo dnf install ./HPC-Hub_*_linux_x86_64.rpm`

## VPN setup

Wulver and Yale use a university VPN.

- **Windows and macOS**: the first time you connect, HPC Hub asks to set up its VPN helper. Select
  **Set up** and approve the system prompt.
- **Linux**: install `openconnect`. Yale's web sign-in also needs
  `python3-gi gir1.2-webkit-6.0` (Ubuntu, Debian) or `python3-gobject webkitgtk6.0`
  (Fedora).

!!! note

    On Windows and macOS, all your DNS goes through the university while the VPN is up. On
    Windows, **Disconnect** doesn't sign you out on the VPN server; that session ends by itself.

## Update HPC Hub

From version **0.2.1**, HPC Hub checks for new versions a little after it starts and twice a
day. When one is out, **Update to** and the version show in the sidebar. Select it, then
**Update and restart**.

To check now, open **Settings**, then **About HPC Hub**, then **Check for
updates**.

Your jobs keep running on the clusters while HPC Hub restarts. If an update fails, select **Download by
hand**.

Updates from inside the app work for the Windows installer, the macOS app and the Linux AppImage. A
`.deb` or `.rpm` install updates by installing the new file. Versions before 0.2.1 update
the same way once.

## Android

The phone app is not in any store yet. If a release has an Android `.apk`, you can install it from
there. See [Android app](phone.md).

## Next

Open HPC Hub and follow [First sign-in](first-sign-in.md).
