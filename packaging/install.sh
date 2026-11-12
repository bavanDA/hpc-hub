#!/bin/sh
# Installs or updates HPC Hub on macOS (Apple silicon) or Linux (x86_64) from the newest GitHub release, in one line:
#   curl -fsSL https://github.com/bavanDA/hpc-hub/releases/latest/download/install.sh | sh
# It checks the download against the release's SHA256SUMS.txt and needs no sudo. Logins and settings are kept.
# For testing: HPCHUB_TAG=v0.2.0 picks a release, HPCHUB_DRYRUN=1 stops before installing, HPCHUB_NOSTART=1 doesn't
# start the app, HPCHUB_APPDIR puts the app in another folder.
set -eu

REPO=bavanDA/hpc-hub
BYHAND="Download it from https://github.com/$REPO/releases instead."
say() { printf '%s\n' "$*"; }
fail() { printf '%s %s\n' "$*" "$BYHAND" >&2; exit 1; }

case "$(uname -s) $(uname -m)" in
  "Darwin arm64") os=mac; file_end=macos_apple-silicon.dmg ;;
  "Darwin "*) fail "HPC Hub is built for Apple silicon Macs only, not Intel ones yet." ;;
  "Linux x86_64") os=linux; file_end=linux_x86_64.AppImage ;;
  *) fail "There is no HPC Hub build for $(uname -s) on $(uname -m) yet." ;;
esac

# the release: the newest, or the one asked for
if [ -n "${HPCHUB_TAG:-}" ]; then api="https://api.github.com/repos/$REPO/releases/tags/$HPCHUB_TAG"
else api="https://api.github.com/repos/$REPO/releases/latest"; fi
json=$(curl -fsSL -H "User-Agent: hpc-hub-install" "$api") || fail "Could not reach GitHub."
tag=$(printf '%s' "$json" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$tag" ] || fail "Could not read the newest release."
version=${tag#v}
name="HPC-Hub_${version}_${file_end}"
base="https://github.com/$REPO/releases/download/$tag"

# what is installed now
if [ "$os" = mac ]; then
  if [ -n "${HPCHUB_APPDIR:-}" ]; then appdir=$HPCHUB_APPDIR
  elif [ -w /Applications ]; then appdir=/Applications
  else appdir="$HOME/Applications"; fi
  app="$appdir/HPC Hub.app"
  have=$(defaults read "$app/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)
else
  appdir=${HPCHUB_APPDIR:-$HOME/Applications}
  app="$appdir/HPC-Hub.AppImage"
  have=$(cat "$appdir/.hpc-hub-version" 2>/dev/null || true)
  [ -f "$app" ] || have=""
fi
if [ -n "$have" ]; then say "HPC Hub $have is installed."; fi
if [ "$have" = "$version" ]; then say "HPC Hub $version is the newest version. Nothing to do."; exit 0; fi

# download and check it against the release's list
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
say "Downloading HPC Hub $version..."
curl -fsSL -o "$tmp/$name" "$base/$name" || fail "The download failed."
curl -fsSL -o "$tmp/SHA256SUMS.txt" "$base/SHA256SUMS.txt" || fail "Could not get the release's checksums."
want=$(grep "  $name\$" "$tmp/SHA256SUMS.txt" | cut -d' ' -f1)
[ -n "$want" ] || fail "The release lists no checksum for $name."
if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$tmp/$name" | cut -d' ' -f1)
else got=$(shasum -a 256 "$tmp/$name" | cut -d' ' -f1); fi
[ "$got" = "$want" ] || fail "The download doesn't match the release's checksum, so it was not installed."
say "Checked: the download matches the release."

if [ -n "${HPCHUB_DRYRUN:-}" ]; then say "Dry run: would install $version to $app, then start it."; exit 0; fi

if [ "$os" = mac ]; then
  if pgrep -f "$app/Contents/MacOS/" >/dev/null 2>&1; then  # only the copy being replaced
    say "Closing HPC Hub to update it..."; osascript -e 'quit app "HPC Hub"' || true; sleep 2
  fi
  mkdir -p "$appdir" "$tmp/mnt"
  hdiutil attach -nobrowse -quiet -mountpoint "$tmp/mnt" "$tmp/$name" || fail "Could not open the disk image."
  rm -rf "$app.new"
  ditto "$tmp/mnt/HPC Hub.app" "$app.new" || { hdiutil detach -quiet "$tmp/mnt"; fail "Could not copy the app."; }
  hdiutil detach -quiet "$tmp/mnt" || true
  rm -rf "$app" && mv "$app.new" "$app"
  # the app isn't signed by Apple yet: without this, macOS refuses to open what curl downloaded. The file was checked
  # against the release's checksums above, so it is the one that was published.
  xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  say "HPC Hub $version is installed in $appdir."
  [ -n "${HPCHUB_NOSTART:-}" ] || open "$app"
  exit 0
fi

# Linux: the AppImage, which updates itself from the app later
mkdir -p "$appdir" "$HOME/.local/share/applications" "$HOME/.local/share/icons"
mv "$tmp/$name" "$app.new" && chmod +x "$app.new"
if pgrep -f -x "$app" >/dev/null 2>&1; then  # only when this AppImage is the one running
  say "Closing HPC Hub to update it. Work on the clusters keeps running."
  pkill -x hpc-hub-backend 2>/dev/null || true; pkill -x hpc-hub 2>/dev/null || true; sleep 1
fi
mv "$app.new" "$app"
printf '%s\n' "$version" > "$appdir/.hpc-hub-version"
# the app menu entry, with the icon from inside the AppImage (a missing icon never stops the install)
icon=hpc-hub
inside=usr/share/icons/hicolor/128x128/apps/hpc-hub.png
if (cd "$tmp" && "$app" --appimage-extract "$inside" >/dev/null 2>&1) && [ -f "$tmp/squashfs-root/$inside" ]; then
  cp "$tmp/squashfs-root/$inside" "$HOME/.local/share/icons/hpc-hub.png" && icon="$HOME/.local/share/icons/hpc-hub.png"
fi
cat > "$HOME/.local/share/applications/hpc-hub.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=HPC Hub
Comment=Work on HPC clusters
Exec="$app"
Icon=$icon
Categories=Development;Network;
Terminal=false
EOF
say "HPC Hub $version is installed in $appdir and in your app menu."
if ! command -v openconnect >/dev/null 2>&1; then
  say "For clusters with a VPN, also install openconnect, for example:"
  say "  sudo apt install openconnect  (or dnf, pacman -S, zypper install)"
fi
if [ -z "${HPCHUB_NOSTART:-}" ]; then
  (nohup "$app" >/dev/null 2>&1 &) || true
fi
