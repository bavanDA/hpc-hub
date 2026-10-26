#!/usr/bin/env bash
# openconnect for the Windows app, with the DLLs it needs, vpnc-script-win.js, wintun.dll, our wrapper
# and the licenses, in app/src-tauri/vpn/openconnect/. See docs/design/vpn-helper.md.
# MSYS2 has no openconnect package, so this builds the release (as openconnect-gui does) against
# MSYS2's GnuTLS. Runs in an MSYS2 UCRT64 shell:
#
#     bash packaging/fetch_openconnect_windows.sh      (CI: msys2/setup-msys2, shell: msys2 {0})
set -euo pipefail

OC_VERSION=9.21
OC_SHA256=5b32369467db6e5f317aa1ed12cfcbb81ed00bdbc765450b6bfcbdc300944a58
VPNC_SCRIPTS_COMMIT=ce9e961bd0f6b867e1c7c35f78f6fb973f6ff101
VPNC_SCRIPT_WIN_SHA256=e196fdf0cc8b325180154535f843034dc0ae9eb43ead9980adfcfc57c58069b2
VPNC_SCRIPTS_COPYING_SHA256=8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643
WINTUN_VERSION=0.14.1
WINTUN_SHA256=07c256185d6ee3652e09fa55c0b673e2624b565e02c4b9091c79ca7d2f24ef51

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/app/src-tauri/vpn/openconnect
WORK=$ROOT/build/openconnect-windows

die() {
	echo "error: $*" >&2
	exit 1
}

# fetch <url> <sha256> <file>
fetch() {
	curl -fsSL --retry 3 -o "$3" "$1" || die "could not download $1"
	echo "$2  $3" | sha256sum -c - >/dev/null || die "$1 does not have the expected SHA256 ($2)"
}

case ${MSYSTEM:-} in
UCRT64 | MINGW64) ;;
*) die "run this in an MSYS2 UCRT64 shell (MSYSTEM is '${MSYSTEM:-not set}')" ;;
esac
[ -n "${MINGW_PREFIX:-}" ] && [ -n "${MINGW_PACKAGE_PREFIX:-}" ] && [ -n "${MINGW_CHOST:-}" ] ||
	die "MINGW_PREFIX not set: use an MSYS2 login shell"
P=$MINGW_PACKAGE_PREFIX

# -y: the package lists of a fresh MSYS2 can be older than its mirrors
pacman -Sy --needed --noconfirm --noprogressbar make diffutils curl unzip \
	"$P-gcc" "$P-binutils" "$P-pkgconf" "$P-gnutls" "$P-libxml2" "$P-zlib" "$P-lz4"

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT/licenses"

# openconnect: the release tarball (has configure, so no autotools), only the program and its DLL
fetch "https://www.infradead.org/openconnect/download/openconnect-$OC_VERSION.tar.gz" "$OC_SHA256" \
	"$WORK/openconnect.tar.gz"
tar -xzf "$WORK/openconnect.tar.gz" -C "$WORK"
SRC=$WORK/openconnect-$OC_VERSION
# newer mingw-w64 dropped sec_api/stdlib_s.h; stdlib.h declares the same (errno_t, the _s functions)
sed -i 's|#include <sec_api/stdlib_s.h>|#include <stdlib.h>|' "$SRC/compat.c"
grep -q 'sec_api/stdlib_s.h' "$SRC/compat.c" && { echo "compat.c patch did not apply" >&2; exit 1; }
(
	cd "$SRC"
	./configure --build="$MINGW_CHOST" --host="$MINGW_CHOST" \
		--disable-dependency-tracking --disable-nls --disable-nsis-installer \
		--with-gnutls --without-openssl --without-libpskc --without-libproxy --without-stoken \
		--with-vpnc-script=vpnc-script-win.js \
		CFLAGS="-O2 -Wno-error=incompatible-pointer-types"
	make -j"$(nproc)" "openconnect.exe"
)
# libtool puts the real program next to its DLL in .libs (the one above it is a launcher)
for f in openconnect.exe libopenconnect-5.dll; do
	if [ -f "$SRC/.libs/$f" ]; then cp "$SRC/.libs/$f" "$OUT/"; elif [ -f "$SRC/$f" ]; then cp "$SRC/$f" "$OUT/"; fi
done
[ -f "$OUT/openconnect.exe" ] || die "the build made no openconnect.exe"

# Every DLL it loads, walked recursively: ours from .libs, the rest from MSYS2. What neither has is
# Windows' own (KERNEL32, ucrtbase, ...).
declare -A seen=()
system=()
copy_deps() { # <exe or dll>
	local dep key src dir
	for dep in $(objdump -p "$1" | sed -n 's/^[[:space:]]*DLL Name: //p' | tr -d '\r'); do
		key=${dep,,}
		[ -z "${seen[$key]:-}" ] || continue
		seen[$key]=1
		src=''
		for dir in "$SRC/.libs" "$MINGW_PREFIX/bin"; do
			if [ -f "$dir/$dep" ]; then src=$dir/$dep && break; fi
		done
		if [ -z "$src" ]; then
			system+=("$dep")
			continue
		fi
		[ -f "$OUT/$dep" ] || cp "$src" "$OUT/"
		copy_deps "$src"
	done
}
copy_deps "$OUT/openconnect.exe"
echo "From Windows: ${system[*]}"

# Its script, and wintun (openconnect loads wintun.dll from its own folder)
fetch "https://gitlab.com/openconnect/vpnc-scripts/-/raw/$VPNC_SCRIPTS_COMMIT/vpnc-script-win.js" \
	"$VPNC_SCRIPT_WIN_SHA256" "$OUT/vpnc-script-win.js"
cp "$ROOT/packaging/vpn/hpchub-script.js" "$OUT/hpchub-script.js"
fetch "https://www.wintun.net/builds/wintun-$WINTUN_VERSION.zip" "$WINTUN_SHA256" "$WORK/wintun.zip"
unzip -q -o "$WORK/wintun.zip" -d "$WORK"
cp "$WORK/wintun/bin/amd64/wintun.dll" "$OUT/"

# Licenses: openconnect (LGPL-2.1), vpnc-scripts (GPL-2), wintun's, and the MSYS2 package of each DLL
mkdir -p "$OUT/licenses/openconnect" "$OUT/licenses/vpnc-scripts" "$OUT/licenses/wintun"
cp "$SRC/COPYING.LGPL" "$OUT/licenses/openconnect/"
fetch "https://gitlab.com/openconnect/vpnc-scripts/-/raw/$VPNC_SCRIPTS_COMMIT/COPYING" \
	"$VPNC_SCRIPTS_COPYING_SHA256" "$OUT/licenses/vpnc-scripts/COPYING"
cp "$WORK/wintun/LICENSE.txt" "$OUT/licenses/wintun/"
for dll in "$OUT"/*.dll; do
	pkg=$(pacman -Qqo "$MINGW_PREFIX/bin/$(basename "$dll")" 2>/dev/null) || continue
	name=${pkg#"$P"-}
	[ -d "$OUT/licenses/$name" ] && continue
	mkdir -p "$OUT/licenses/$name"
	pacman -Qi "$pkg" | grep -E '^(Name|Version|Licenses|URL) ' >"$OUT/licenses/$name/PACKAGE.txt"
	if [ -d "$MINGW_PREFIX/share/licenses/$name" ]; then
		cp -r "$MINGW_PREFIX/share/licenses/$name/." "$OUT/licenses/$name/"
	else
		echo "::warning::no license files for $pkg ($(basename "$dll")) in $MINGW_PREFIX/share/licenses"
	fi
done

# GnuTLS should use the Windows certificate store; a CA file path here means it doesn't
echo "GnuTLS's own CA list path(s):"
strings "$OUT"/libgnutls*.dll | grep -E '/(cert|ca-bundle|ca-certificates)[^ ]*\.(pem|crt)$' || echo "  (none)"

# Runs with only Windows' folders on PATH, so a DLL left out can't come from MSYS2
windows=$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")
PATH=$windows/System32:$windows "$OUT/openconnect.exe" --version
echo "openconnect is in $OUT:"
find "$OUT" -type f | sed "s|^$OUT/|  |" | sort
