# Install and update

Install HPC Hub on your own computer, then update it when a new version is out. Nothing needs to be installed on the cluster.

## Install HPC Hub

Use the command for your system, or install from a file you download from the [releases page](https://github.com/bavanDA/hpc-hub/releases).

=== "Windows"

    Use this on Windows 10 and Windows 11. The command downloads the newest HPC Hub installer from GitHub, checks it against the release's checksums, installs the app, and opens it. Run the command again to update an existing install.

    1. Open PowerShell.
    2. Run this command:

    ```powershell
    irm https://github.com/bavanDA/hpc-hub/releases/latest/download/install.ps1 | iex
    ```

    To install from a downloaded file:

    1. Open the [releases page](https://github.com/bavanDA/hpc-hub/releases).
    2. Under "Assets", download the Windows file whose name ends in `-setup.exe`.
    3. Run that file.

    If Windows shows "Windows protected your PC":

    1. Select "More info".
    2. Select "Run anyway".

=== "macOS"

    The macOS build is for Macs with Apple silicon. The command downloads HPC Hub from GitHub, checks it against the release's checksums, puts it in the Applications folder, and opens it. Run the command again to update an existing install.

    1. Open Terminal.
    2. Run this command:

    ```sh
    curl -fsSL https://github.com/bavanDA/hpc-hub/releases/latest/download/install.sh | sh
    ```

    To install from a downloaded file:

    1. Download the `.dmg` from the [releases page](https://github.com/bavanDA/hpc-hub/releases).
    2. Open the `.dmg`.
    3. Drag HPC Hub to the Applications folder.

    If macOS blocks the app:

    1. Open System Settings.
    2. Open Privacy & Security.
    3. Select "Open Anyway".

=== "Linux"

    This build is for `x86_64` computers. The command puts the AppImage in `~/Applications`, adds HPC Hub to your app menu, and opens it. It runs without `sudo`, and the app updates itself from then on. The VPN also needs `openconnect` from your distribution. If `openconnect` is missing, the command tells you how to install it.

    1. Open a terminal.
    2. Run this command:

    ```sh
    curl -fsSL https://github.com/bavanDA/hpc-hub/releases/latest/download/install.sh | sh
    ```

    To install from a downloaded file, get a build from the [releases page](https://github.com/bavanDA/hpc-hub/releases):

    AppImage
    : Make the file executable with `chmod +x HPC-Hub_*_linux_x86_64.AppImage`. Then run the file.

    Ubuntu or Debian
    : Run `sudo apt install ./HPC-Hub_*_linux_amd64.deb`.

    Fedora or RHEL
    : Run `sudo dnf install ./HPC-Hub_*_linux_x86_64.rpm`.

## VPN setup

Wulver and Yale use a university VPN. Your computer needs a short setup the first time you connect.

You can connect several clusters' VPNs at the same time on Windows, macOS, and Linux, as long as each uses split tunnel. Split tunnel is the default. Only that cluster's traffic and its own domain names go through its VPN, and the rest of your internet stays as it is. HPC Hub asks before switching only when one of the VPNs sends all your traffic through itself. That happens when split tunnel is turned off in that cluster's settings.

On Windows and macOS, the first time you connect, HPC Hub asks to set up its VPN helper.

1. Select **Set up**.
2. Approve the system prompt.

On Linux, install `openconnect` from your distribution. Yale's web sign-in also needs `python3-gi` and `gir1.2-webkit-6.0` on Ubuntu or Debian, or `python3-gobject` and `webkitgtk6.0` on Fedora.

!!! note

    On Windows, **Disconnect** does not sign you out on the VPN server. That session ends by itself.

## Update HPC Hub

From version 0.2.1, HPC Hub checks for new versions a little after it starts and twice a day. When a new version is out, the sidebar shows **Update to** and the version.

1. Select **Update to** and the version.
2. Select **Update and restart**.

!!! note

    Your jobs keep running on the clusters while HPC Hub restarts.

If an update fails, select **Download by hand**.

To check now, open **Settings** and select **Check for updates**. It says whether you have the newest version, or
opens the update when one is ready.

Updates from inside the app work for the Windows installer, the macOS app, and the Linux AppImage. A `.deb` or `.rpm` install updates by installing the new file. Versions before 0.2.1 can't update from inside the app: install the new version by hand once, and it updates itself from then on.

## Android

The phone app is not in any store yet. If a release has an Android `.apk`, you can install it from that release. See [Android app](phone.md).

## After you install

Open HPC Hub and follow [First sign-in](first-sign-in.md).
