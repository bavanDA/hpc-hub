# HPC Hub

Work on HPC clusters from Linux, Windows and macOS. One click connects you (VPN, SSH, Duo), gets you a compute node
and opens VS Code, Claude or a terminal there. Set up for NJIT Wulver, Yale Bouchet and SDSC Expanse; add others in
Settings.

![Clusters](docs/screenshots/clusters.png)

| Projects | Jobs |
|---|---|
| ![Projects](docs/screenshots/projects.png) | ![Jobs](docs/screenshots/jobs.png) |

## What it does

- **Clusters**: connect in one click and get a compute node with the size you picked.
- **VS Code**: runs on a compute node and opens on your computer. The window shows each step until it's ready.
- **Projects**: open a folder in VS Code, Claude, Files or LaTeX. Copy a project to another cluster.
- **Terminals and agents**: tmux sessions and Claude, Codex, Antigravity or Cursor keep running when you close the
  laptop.
- **Jobs and usage**: your jobs, history, service units and storage.
- **Files and Globus**: browse, preview, edit, upload, and copy between clusters.

![VS Code](docs/screenshots/vscode.png)

## Install

Get the file for your system from [Releases](../../releases). The app isn't signed yet, so the first start warns you.

- **Windows**: run the `-setup.exe`. On "Windows protected your PC", click **More info**, then **Run anyway**.
- **macOS** (Apple silicon): drag HPC Hub from the `.dmg` to Applications. On first start, go to **System Settings,
  Privacy & Security** and click **Open Anyway**.
- **Linux**: `chmod +x HPC-Hub_*.AppImage` and run it, or install the `.deb` / `.rpm`. The VPN needs `openconnect`;
  Yale's also needs `python3-gi gir1.2-webkit-6.0` (Ubuntu) or `python3-gobject webkitgtk6.0` (Fedora).
- **Android**: coming soon.

The first VPN connection on Windows and macOS asks once to set up the VPN helper.

## Updates

From 0.2.1 on, HPC Hub updates itself: click **Update** in the sidebar when a new version is out. Installed from a
`.deb` or `.rpm`? Install the new file from Releases instead.

## Safety

Passwords stay in your system's keyring, never in plain text. Updates are signed, and the app installs only ours.
Your VPN password is typed only into your university's own sign-in page. One exception: VS Code keeps its GitHub
sign-in on the cluster, in your home folder (`code tunnel user logout` removes it).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT license.
