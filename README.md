# HPC Hub

One-click access to Wulver, Yale and SDSC from Fedora: VPN, SSH with Duo push,
compute nodes, jobs, VS Code, Claude, files and LaTeX.

Logins are typed into the app and kept in GNOME Keyring. Nothing is hardcoded.

## Run

    ./bin/hpc-hub

## Install (app grid entry)

    ./install.sh

Needs: python3-gobject, python3-cairo, gtk4, libadwaita, libsecret, webkitgtk6.0,
vte291-gtk4, gtksourceview5, poppler-glib, openconnect, NetworkManager-openconnect, openssh.

## Tabs

- **Clusters**: connect (VPN + Duo), compute node, VS Code, Claude, Files buttons.
- **Jobs**: my jobs, history or all jobs; filter, details, cancel.
- **Files**: two cluster panes; open, PDF, edit, zip, upload/download, copy across (direct or Globus).
- **LaTeX**: edit on the cluster, build with latexmk, PDF preview, git history/commit/pull/push.
- **Terminals**: VS Code and Claude sessions (tmux on the cluster, so they survive disconnects).

Globus: menu → Globus… (needs your own free Globus client id).

## Code layout

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

Each feature keeps its logic at the top and its GTK screens in `ui/`. Tests in `tests/` follow the same folders.
See CODING_STANDARDS.md.
