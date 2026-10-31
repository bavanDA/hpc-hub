#!/usr/bin/env bash
# openconnect for the macOS app: Homebrew's, made self-contained with dylibbundler (its libraries in lib/,
# loaded from @executable_path/lib), plus vpnc-script, our wrapper and the licenses, in
# app/src-tauri/vpn/openconnect/. See docs/design/vpn-helper.md.
#
#     packaging/fetch_openconnect_macos.sh      (CI: macos-15, arm64)
set -euo pipefail

OC_VERSION=9.21  # what Homebrew had when this was written; another one only warns
VPNC_SCRIPTS_COMMIT=ce9e961bd0f6b867e1c7c35f78f6fb973f6ff101
VPNC_SCRIPT_SHA256=f0c4d936a382f07711263242699b5e2d85d1ace37136bb78785d352997c17742
VPNC_SCRIPTS_COPYING_SHA256=8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/app/src-tauri/vpn/openconnect

die() {
	echo "error: $*" >&2
	exit 1
}

# fetch <url> <sha256> <file>
fetch() {
	curl -fsSL --retry 3 -o "$3" "$1" || die "could not download $1"
	echo "$2  $3" | shasum -a 256 -c - >/dev/null || die "$1 does not have the expected SHA256 ($2)"
}

[ "$(uname -s)" = Darwin ] || die "this is for macOS"
command -v brew >/dev/null || die "Homebrew is needed (https://brew.sh)"

export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
export HOMEBREW_NO_ANALYTICS=1 HOMEBREW_NO_ENV_HINTS=1
brew install openconnect dylibbundler

BREW=$(brew --prefix)
KEG=$(brew --prefix openconnect)
version=$(brew list --versions openconnect | awk '{print $2}')
[ "$version" = "$OC_VERSION" ] || echo "::warning::Homebrew's openconnect is $version, not $OC_VERSION"
src=$KEG/bin/openconnect
[ -x "$src" ] || src=$KEG/sbin/openconnect
[ -x "$src" ] || die "no openconnect program in $KEG"

rm -rf "$OUT"
mkdir -p "$OUT/lib" "$OUT/licenses"
cp "$src" "$OUT/openconnect"
chmod 755 "$OUT/openconnect"

# Copies the Homebrew libraries it needs into lib/ and points it and them there. </dev/null: if it can't
# find a library it asks for a path, and with no answer the step times out instead of guessing.
dylibbundler -of -b -x "$OUT/openconnect" -d "$OUT/lib" -p @executable_path/lib/ -s "$BREW/lib" </dev/null
# The changed files need a new (ad hoc) signature to run on Apple silicon
codesign --force --sign - "$OUT/openconnect" "$OUT"/lib/*.dylib

# Nothing may load from Homebrew any more: only the system's libraries and ours
bad=$(otool -L "$OUT/openconnect" "$OUT"/lib/*.dylib | awk '/^\t/ {print $1}' |
	grep -Ev '^(/usr/lib/|/System/Library/|@executable_path/lib/)' || true)
[ -z "$bad" ] || die "still linked outside the bundle: $bad"
for lib in $(otool -L "$OUT/openconnect" "$OUT"/lib/*.dylib | awk '/^\t@executable_path\/lib\// {print $1}'); do
	[ -f "$OUT/lib/${lib#@executable_path/lib/}" ] || die "missing from lib/: $lib"
done
if otool -l "$OUT/openconnect" "$OUT"/lib/*.dylib | grep -A2 LC_RPATH | grep -E "$BREW|/usr/local"; then
	die "an rpath still points into Homebrew"
fi
echo "Linked libraries:"
otool -L "$OUT/openconnect"

fetch "https://gitlab.com/openconnect/vpnc-scripts/-/raw/$VPNC_SCRIPTS_COMMIT/vpnc-script" \
	"$VPNC_SCRIPT_SHA256" "$OUT/vpnc-script"
cp "$ROOT/packaging/vpn/hpchub-script.sh" "$OUT/hpchub-script.sh"
chmod 755 "$OUT/vpnc-script" "$OUT/hpchub-script.sh"

# Licenses: openconnect (LGPL-2.1), vpnc-scripts (GPL-2), and the Homebrew package of each library
copy_licenses() { # <keg dir> <dest dir>
	mkdir -p "$2"
	find "$1" -maxdepth 1 -type f \( -iname 'COPYING*' -o -iname 'LICEN[CS]E*' -o -iname 'COPYRIGHT*' \
		-o -iname 'NOTICE*' -o -iname 'AUTHORS*' \) -exec cp {} "$2/" \;
}
formula_info() { # <formula> <dest dir>
	brew info --json=v2 "$1" | python3 -c "import json, sys
f = json.load(sys.stdin)['formulae'][0]
print(f['name'], f['versions']['stable'])
print('License:', f['license'])
print('Homepage:', f['homepage'])" >"$2/PACKAGE.txt"
}
copy_licenses "$(cd "$KEG" && pwd -P)" "$OUT/licenses/openconnect"
formula_info openconnect "$OUT/licenses/openconnect"
mkdir -p "$OUT/licenses/vpnc-scripts"
fetch "https://gitlab.com/openconnect/vpnc-scripts/-/raw/$VPNC_SCRIPTS_COMMIT/COPYING" \
	"$VPNC_SCRIPTS_COPYING_SHA256" "$OUT/licenses/vpnc-scripts/COPYING"
for lib in "$OUT"/lib/*.dylib; do
	name=$(basename "$lib")
	real=$(realpath "$BREW/lib/$name" 2>/dev/null || true)
	if [ ! -f "$real" ]; then
		real=$(find "$BREW/Cellar" -name "$name" -path '*/lib/*' 2>/dev/null | head -n 1)
	fi
	case $real in "$BREW"/Cellar/*) ;; *) die "can't tell which Homebrew package has $name" ;; esac
	rest=${real#"$BREW"/Cellar/}
	formula=${rest%%/*}
	rest=${rest#*/}
	keg=$BREW/Cellar/$formula/${rest%%/*}
	[ -d "$OUT/licenses/$formula" ] && continue
	copy_licenses "$keg" "$OUT/licenses/$formula"
	formula_info "$formula" "$OUT/licenses/$formula"
	[ -n "$(find "$OUT/licenses/$formula" -type f ! -name PACKAGE.txt)" ] ||
		echo "::warning::no license file in $keg ($name)"
done

# Homebrew's GnuTLS trusts only $BREW/etc/gnutls/cert.pem, not the macOS keychain, so a Mac without
# Homebrew has no CA list: ship Homebrew's (Mozilla's), for openconnect --cafile when signing in.
cp "$BREW/etc/ca-certificates/cert.pem" "$OUT/cert.pem" || die "no CA list at $BREW/etc/ca-certificates/cert.pem"
copy_licenses "$(cd "$(brew --prefix ca-certificates)" && pwd -P)" "$OUT/licenses/ca-certificates"
formula_info ca-certificates "$OUT/licenses/ca-certificates"
echo "GnuTLS's own CA list path(s):"
strings "$OUT"/lib/libgnutls*.dylib | grep -E '/(cert|ca-bundle|ca-certificates)[^ ]*\.(pem|crt)$' || echo "  (none)"

"$OUT/openconnect" --version
echo "openconnect is in $OUT:"
find "$OUT" -type f | sed "s|^$OUT/|  |" | sort
