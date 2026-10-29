#!/bin/sh
# Adds HPC Hub to the app grid and ~/.local/bin, after checking what it needs.
#   ./install.sh          check, then install
#   ./install.sh --check  only check
set -e
repo="$(cd "$(dirname "$0")" && pwd)"
app_id="local.hpchub.HpcHub"

# What the app loads (libadwaita 1.7+ for its toggle groups) and the programs it runs
missing=$(/usr/bin/env python3 - <<'PY'
import importlib.util, shutil
need = {"Gtk": "4.0", "Adw": "1", "Secret": "1", "WebKit": "6.0", "Vte": "3.91", "GtkSource": "5",
        "Poppler": "0.18"}
out = []
try:
    import gi
    for name, version in need.items():
        try:
            gi.require_version(name, version)
            mod = __import__("gi.repository", fromlist=[name]).__dict__[name]
            if name == "Adw" and (mod.get_major_version(), mod.get_minor_version()) < (1, 7):
                out.append("libadwaita-1.7")
        except (ValueError, ImportError, KeyError):
            out.append(name)
except ImportError:
    out.append("gi")
if not importlib.util.find_spec("cryptography"):
    out.append("cryptography")
out += [c for c in ("ssh", "openconnect", "nmcli") if not shutil.which(c)]
print(" ".join(out))
PY
)
for d in /usr/lib/NetworkManager/VPN /usr/lib64/NetworkManager/VPN /etc/NetworkManager/VPN; do
    [ -e "$d/nm-openconnect-service.name" ] && nm_plugin=1
done
[ -n "$nm_plugin" ] || missing="$missing nm-openconnect"

if [ -n "$missing" ]; then
    echo "HPC Hub needs: $missing"
    . /etc/os-release 2>/dev/null || true
    case " ${ID:-} ${ID_LIKE:-} " in
        *" fedora "*|*" rhel "*|*" centos "*)
            echo "Install with: sudo dnf install python3-gobject python3-cairo python3-cryptography gtk4 libadwaita" \
                 "libsecret webkitgtk6.0 vte291-gtk4 gtksourceview5 poppler-glib openconnect NetworkManager-openconnect" \
                 "openssh-clients python3-qrcode" ;;
        *" debian "*|*" ubuntu "*)
            echo "Install with: sudo apt install python3-gi python3-gi-cairo python3-cryptography gir1.2-gtk-4.0" \
                 "gir1.2-adw-1 gir1.2-secret-1 gir1.2-webkit-6.0 gir1.2-vte-3.91 gir1.2-gtksource-5" \
                 "gir1.2-poppler-0.18 openconnect network-manager-openconnect openssh-client python3-qrcode" ;;
        *" arch "*)
            echo "Install with: sudo pacman -S python-gobject python-cairo python-cryptography gtk4 libadwaita" \
                 "libsecret webkitgtk-6.0 vte4 gtksourceview5 poppler-glib openconnect networkmanager-openconnect" \
                 "openssh python-qrcode" ;;
        *" suse "*|*" opensuse "*)
            echo "Install with: sudo zypper install python3-gobject python3-gobject-cairo python3-cryptography" \
                 "typelib-1_0-Gtk-4_0 typelib-1_0-Adw-1 typelib-1_0-Secret-1 typelib-1_0-WebKit-6_0" \
                 "typelib-1_0-Vte-3_91 typelib-1_0-GtkSource-5 typelib-1_0-Poppler-0_18 openconnect" \
                 "NetworkManager-openconnect openssh-clients python3-qrcode" ;;
        *) echo "Install them with your package manager: GTK 4, libadwaita 1.7+, libsecret, WebKitGTK 6," \
                "VTE for GTK 4, GtkSourceView 5, Poppler GLib, their Python (GObject) bindings, python3-cryptography," \
                "openconnect, NetworkManager's openconnect plugin, an SSH client and python3-qrcode." ;;
    esac
    exit 1
fi
echo "Everything HPC Hub needs is installed."
python3 -c "import qrcode" 2>/dev/null || echo "Optional: python3-qrcode, for Set up the phone app (a QR code)."
[ "$1" = "--check" ] && exit 0

mkdir -p "$HOME/.local/share/applications" "$HOME/.local/bin"
ln -sf "$repo/bin/hpc-hub" "$HOME/.local/bin/hpc-hub"
cat > "$HOME/.local/share/applications/$app_id.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=HPC Hub
Comment=Work on your HPC clusters: connect, jobs, files, VS Code and agents
Exec=$repo/bin/hpc-hub
Icon=network-server
Terminal=false
Categories=Network;Development;
StartupNotify=true
DBusActivatable=false
DESKTOP
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed. Open 'HPC Hub' from the app grid or run: hpc-hub"
