#!/bin/sh
# Adds HPC Hub to the app grid and ~/.local/bin.
set -e
repo="$(cd "$(dirname "$0")" && pwd)"
app_id="local.hpchub.HpcHub"

need="python3-gobject python3-cairo python3-cryptography gtk4 libadwaita libsecret webkitgtk6.0 vte291-gtk4 gtksourceview5 poppler-glib openconnect NetworkManager-openconnect openssh-clients"
missing=""
for p in $need; do rpm -q "$p" >/dev/null 2>&1 || missing="$missing $p"; done
if [ -n "$missing" ]; then
    echo "Missing packages:$missing"
    echo "Install with: sudo dnf install$missing"
    exit 1
fi

mkdir -p "$HOME/.local/share/applications" "$HOME/.local/bin"
ln -sf "$repo/bin/hpc-hub" "$HOME/.local/bin/hpc-hub"
cat > "$HOME/.local/share/applications/$app_id.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=HPC Hub
Comment=Connect to Wulver, Yale and SDSC
Exec=$repo/bin/hpc-hub
Icon=network-server
Terminal=false
Categories=Network;
StartupNotify=true
DBusActivatable=false
DESKTOP
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed. Open 'HPC Hub' from the app grid or run: hpc-hub"
