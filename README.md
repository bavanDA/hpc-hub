# HPC Hub

An app for working on HPC clusters from Linux, Windows and macOS (Android is on the way). One click connects you (VPN, SSH, Duo or a code from your
authenticator app), gets you a compute node, and opens VS Code, Claude or a terminal there. Files, jobs, Globus
transfers and LaTeX are in the same window.

It comes set up for NJIT Wulver, Yale Bouchet and SDSC Expanse. You can add other clusters in Settings.

![Clusters: connect, get a compute node, open tools](docs/screenshots/clusters.png)

| Projects | Jobs |
|---|---|
| ![Projects](docs/screenshots/projects.png) | ![Jobs](docs/screenshots/jobs.png) |

## What it does

- **Clusters**: connect with one button. VPN, SSH and Duo push are handled for you. Ask for a compute node with the
  cores, memory and time you saved for that cluster.
- **Jobs and usage**: your jobs, your history or everyone's, with filters, details and cancel. Service units per
  person and storage quotas.
- **Projects**: name a folder on a cluster and open it in VS Code, Claude, Files or LaTeX in one click. Copy or sync a
  project, with its Claude chats, to another cluster.
- **Terminals**: tmux sessions on the cluster, so VS Code tunnels and agents keep running when you close the laptop.
- **Agents**: run Claude, Codex, Antigravity or Cursor on a compute node, and choose which commands they may run.
- **Files**: browse, preview PDFs and images, edit, zip, upload and download. Copy between clusters directly or with
  Globus, with live progress.
- **Globus**: sign in once. The app finds each cluster's collection by itself and asks only for the permissions
  Globus needs.

Experimental, off until you turn them on in Settings:

- **LaTeX**: an Overleaf-like editor for projects on the cluster. Build with latexmk, jump between source and PDF,
  see git history, pull and push.
- **Skills**: add skills to Claude and Codex on each cluster, from HPC Hub's set or any git repository.
- **Scheduled agents**: an agent runs a task on its own, for example every night at 02:00.

## Safety

- Usernames and passwords are typed into the app and kept in your system's keyring (GNOME Keyring, macOS Keychain,
  Windows Credential Manager; on Android an encrypted file whose key stays in the phone's Keystore), never in plain
  text and never hardcoded. Settings in `~/.config/hpc-hub` hold no secrets.
- Globus sign-in uses OAuth with PKCE in your own browser. Tokens are kept in the keyring.
- Your saved VPN password is typed only into sign-in pages of your university's own site or a known sign-in
  provider, over https.
- One exception, on the cluster: VS Code keeps its GitHub sign-in in your home folder there, unencrypted, so a
  tunnel on a new node does not ask you again. Sign out with `code tunnel user logout` if you don't want that.

## Install

The Windows and macOS installers come from the [Build](../../actions/workflows/build.yml) workflow: open its latest
run and download `hpc-hub-Windows` or `hpc-hub-macOS` under Artifacts. They are not signed yet, so your system warns
you the first time.

### Windows 10 and 11

1. Run the `.msi` (or the `-setup.exe`) from `hpc-hub-Windows`. If Windows says "Windows protected your PC", click
   **More info**, then **Run anyway**.
2. Open HPC Hub from the Start menu.
3. The first time you connect a cluster with a VPN (Wulver, Yale), HPC Hub asks to set up its VPN helper. Click
   **Set up** and approve the Windows prompt. This happens once.

### macOS (Apple silicon)

1. Open the `.dmg` from `hpc-hub-macOS` and drag HPC Hub to Applications.
2. Open it. macOS says it can't check the app: go to **System Settings, Privacy & Security**, scroll down and click
   **Open Anyway**. This happens once.
3. The first time you connect a cluster with a VPN, approve "Set up the VPN helper" and type your Mac password once.

On Windows and macOS the VPN sends all your DNS through the university while it is up, and Disconnect on Windows
doesn't sign you out on the VPN server (it ends by itself).

### Linux

Fedora, Ubuntu, Debian, Arch, openSUSE and others:

    git clone <this repo> && cd hpc-hub
    ./install.sh

It checks for GTK 4, libadwaita 1.7+, WebKitGTK, VTE, openconnect and the rest. If something is missing, it prints
the install command for your distribution. Then it adds HPC Hub to the app grid and `hpc-hub` to `~/.local/bin`.
`./install.sh --check` only checks. To run without installing: `./bin/hpc-hub`.

### Android

Not released yet. To try it, build it yourself (see [docs/design/android.md](docs/design/android.md)). It will come
to Google Play and F-Droid. To log in, open HPC Hub's menu on your computer, then Set up the phone app, and scan the
QR code with the phone.

## Globus

Globus copies need a free Globus app id. Make one at app.globus.org/settings/developers (choose a native app, name it
HPC Hub, redirect URL `https://auth.globus.org/v2/web/auth-code`) and paste it on the Globus page.

## Code layout

    bin/          launcher, plus the helpers ssh and openconnect call (askpass, SSO)
    hpc_hub/
      core/       config, keyring, SSH: used by every feature
      connect/    VPN, sign-in, Duo, cluster cards
      compute/    Slurm, compute nodes, jobs, usage
      files/      browse, edit and copy files on the clusters
      globus/     Globus sign-in, collections and transfers
      agents/     Claude and other agents, chats, skills, permissions
      latex/      LaTeX editor, build, SyncTeX, git
      pdf/        PDF viewers and read aloud
      projects/   named project folders and copying them across clusters
      terminals/  tmux sessions and terminal tabs
      ui/         main window and shared widgets
    tests/        same folders as hpc_hub/

## Development

    python3 -m venv --system-site-packages .venv
    .venv/bin/pip install pytest ruff
    .venv/bin/python -m pytest -q
    .venv/bin/ruff check hpc_hub tests

Guidelines:

- Each feature keeps its logic at the top of its folder and its GTK pages and dialogs in `ui/`. Logic that parses
  output or builds shell commands stays out of `ui/` and has tests. Shared test fakes are in `tests/helpers.py`.
- Keep modules small and about one thing. A UI file over about 400 lines should be split.
- Never block the GTK main loop: run remote work with `widgets.bg(work, done)`.
- Remote commands go through `SshMaster.run`. Quote paths with `shlex.quote`.
- Never hardcode usernames, passwords or personal paths, including in tests. Use made-up names like `jdoe`.
- Short docstrings, few comments, and only ones that say why. Lines up to 120 characters.
- UI text: plain and short, no em or en dashes.
- Commits: atomic, `type(scope): short msg`.

## License

MIT, see [LICENSE](LICENSE).
