# HPC Hub

One-click access to Wulver, Yale and SDSC from Fedora: VPN, SSH with Duo push,
compute nodes, jobs, VS Code, Claude, files and LaTeX.

Logins are typed into the app and kept in GNOME Keyring. Nothing is hardcoded.

## Run

    ./bin/hpc-hub

## Install (app grid entry)

    ./install.sh

Needs: python3-gobject, gtk4, libadwaita, libsecret, openconnect,
NetworkManager-openconnect, openssh.
