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
