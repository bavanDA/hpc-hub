#!/usr/bin/env bash
# The phone's VPN programs, built from pinned source tarballs (nothing prebuilt in git, so F-Droid can build it):
#   openconnect  Cisco AnyConnect client (NJIT, Yale), with OpenSSL, libxml2 and zlib
#   ocproxy      a TCP/IP stack in userspace: openconnect hands it the tunnel (--script-tun) and it forwards local
#                ports through it, so there is no VpnService and no system-wide VPN
# For Android they go in mobile/src-tauri/gen/android/app/src/main/vpnLibs/<abi>/ as libhpchub_openconnect.so and
# libhpchub_ocproxy.so: lib*.so in the APK's native libraries is the one place Android lets an app run programs
# from (like the backend's launcher). hpc_hub/connect/vpn_android.py starts them. See docs/design/android.md.
#
#     mobile/vpn/build.sh [arm64-v8a|x86_64|host]   (default arm64-v8a; host: this Linux computer, for tests)
set -euo pipefail

ABI=${1:-arm64-v8a}
API=24 # the app's minSdk
NDK_VERSION=27.3.13750724
ZLIB_VERSION=1.3.2
ZLIB_SHA256=bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16
OPENSSL_VERSION=3.5.9
OPENSSL_SHA256=603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a
LIBXML2_VERSION=2.15.4
LIBXML2_SHA256=98087fd181d9070724f3fbc65c7377db03038eb92bd882374daff44940138821
LIBEVENT_VERSION=2.1.13-stable
LIBEVENT_SHA256=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c
OPENCONNECT_VERSION=9.21
OPENCONNECT_SHA256=5b32369467db6e5f317aa1ed12cfcbb81ed00bdbc765450b6bfcbdc300944a58
OCPROXY_COMMIT=c98f06d942970cdf35dd66ab46840f7d6d567b60 # v1.70 and a README fix; the last commit
OCPROXY_SHA256=dfedc2572cf44d0491eb6d639ad9665d65aeaeaaa1d1a7a38605186ac2229c05

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=$ROOT/mobile/build/vpn/$ABI
DOWNLOADS=$ROOT/mobile/build/vpn/downloads
PREFIX=$WORK/prefix
JOBS=$(nproc)

die() {
	echo "error: $*" >&2
	exit 1
}

case $ABI in
arm64-v8a) HOST=aarch64-linux-android OPENSSL_TARGET=android-arm64 ;;
x86_64) HOST=x86_64-linux-android OPENSSL_TARGET=android-x86_64 ;;
host) HOST="" OPENSSL_TARGET=linux-$(uname -m) ;;
*) die "unknown ABI $ABI (arm64-v8a, x86_64 or host)" ;;
esac

if [ -n "$HOST" ]; then
	: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
	NDK=$ANDROID_HOME/ndk/$NDK_VERSION
	[ -d "$NDK" ] || "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "ndk;$NDK_VERSION"
	CLANG=$(echo "$NDK"/toolchains/llvm/prebuilt/*/bin)
	export ANDROID_NDK_ROOT=$NDK PATH=$CLANG:$PATH
	export CC=$CLANG/$HOST$API-clang AR=$CLANG/llvm-ar RANLIB=$CLANG/llvm-ranlib STRIP=$CLANG/llvm-strip
	CONFIGURE_HOST=(--host="$HOST")
	OUT=$ROOT/mobile/src-tauri/gen/android/app/src/main/vpnLibs/$ABI
	# 16 KB pages (Android 15 and later), as the launcher
	export LDFLAGS="-Wl,-z,max-page-size=16384"
else
	export CC=${CC:-cc} AR=${AR:-ar} RANLIB=${RANLIB:-ranlib} STRIP=${STRIP:-strip}
	CONFIGURE_HOST=()
	OUT=$WORK/out
	export LDFLAGS=""
fi
export CFLAGS="-O2 -fPIC" PKG_CONFIG_LIBDIR=$PREFIX/lib/pkgconfig PKG_CONFIG_PATH=""

# fetch <url> <sha256> <file>: downloaded once, checked every time
fetch() {
	[ -f "$DOWNLOADS/$3" ] || curl -fsSL --retry 3 -o "$DOWNLOADS/$3" "$1" || die "could not download $1"
	echo "$2  $DOWNLOADS/$3" | sha256sum -c - >/dev/null || die "$1 does not have the expected SHA256 ($2)"
}

# unpack <file> <dir>: a fresh copy of the source
unpack() {
	rm -rf "$2" && mkdir -p "$2" && tar -xf "$DOWNLOADS/$1" -C "$2" --strip-components 1
}

# quiet <log> <command...>: the output goes to a log, shown only when the step fails
quiet() {
	local log=$1
	shift
	"$@" >"$log" 2>&1 || {
		tail -40 "$log" >&2
		die "failed: $* (full log: $log)"
	}
}

mkdir -p "$DOWNLOADS" "$WORK" "$PREFIX/lib" "$OUT"
cd "$WORK"

fetch "https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.gz" "$ZLIB_SHA256" \
	"zlib-$ZLIB_VERSION.tar.gz"
fetch "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL_VERSION/openssl-$OPENSSL_VERSION.tar.gz" \
	"$OPENSSL_SHA256" "openssl-$OPENSSL_VERSION.tar.gz"
fetch "https://download.gnome.org/sources/libxml2/${LIBXML2_VERSION%.*}/libxml2-$LIBXML2_VERSION.tar.xz" \
	"$LIBXML2_SHA256" "libxml2-$LIBXML2_VERSION.tar.xz"
fetch "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_VERSION/libevent-$LIBEVENT_VERSION.tar.gz" \
	"$LIBEVENT_SHA256" "libevent-$LIBEVENT_VERSION.tar.gz"
fetch "https://www.infradead.org/openconnect/download/openconnect-$OPENCONNECT_VERSION.tar.gz" "$OPENCONNECT_SHA256" \
	"openconnect-$OPENCONNECT_VERSION.tar.gz"
fetch "https://github.com/cernekee/ocproxy/archive/$OCPROXY_COMMIT.tar.gz" "$OCPROXY_SHA256" "ocproxy-$OCPROXY_COMMIT.tar.gz"

# Libraries, static: each program is one file with only the system's own libraries next to it
if [ ! -f "$PREFIX/lib/libz.a" ]; then
	echo "zlib $ZLIB_VERSION"
	unpack "zlib-$ZLIB_VERSION.tar.gz" zlib
	(cd zlib && quiet ../zlib.log ./configure --static --prefix="$PREFIX" && quiet ../zlib.log make -j"$JOBS" install)
fi

if [ ! -f "$PREFIX/lib/libssl.a" ]; then
	echo "OpenSSL $OPENSSL_VERSION"
	unpack "openssl-$OPENSSL_VERSION.tar.gz" openssl
	# OpenSSL's android targets find the NDK's clang themselves (ANDROID_NDK_ROOT, PATH) and want the API this way
	(cd openssl && { [ -z "$HOST" ] || unset CC AR RANLIB; } &&
		quiet ../openssl.log ./Configure "$OPENSSL_TARGET" ${HOST:+-D__ANDROID_API__=$API} no-shared no-tests \
		no-docs no-apps no-engine no-module --prefix="$PREFIX" --libdir=lib &&
		quiet ../openssl.log make -j"$JOBS" build_libs && quiet ../openssl.log make install_dev)
fi

if [ ! -f "$PREFIX/lib/libxml2.a" ]; then
	echo "libxml2 $LIBXML2_VERSION"
	unpack "libxml2-$LIBXML2_VERSION.tar.xz" libxml2
	(cd libxml2 && quiet ../libxml2.log ./configure "${CONFIGURE_HOST[@]}" --prefix="$PREFIX" --disable-shared \
		--enable-static --without-python --without-iconv --without-zlib --without-icu --without-modules \
		--without-debug --without-catalog --without-schemas --without-relaxng --without-readline --without-history &&
		quiet ../libxml2.log make -j"$JOBS" install-libLTLIBRARIES install-pkgconfigDATA install-data)
fi

if [ ! -f "$PREFIX/lib/libevent_core.a" ]; then
	echo "libevent $LIBEVENT_VERSION"
	unpack "libevent-$LIBEVENT_VERSION.tar.gz" libevent
	(cd libevent && quiet ../libevent.log ./configure "${CONFIGURE_HOST[@]}" --prefix="$PREFIX" --disable-shared \
		--enable-static --disable-openssl --disable-mbedtls --disable-samples --disable-libevent-regress \
		--disable-debug-mode && quiet ../libevent.log make -j"$JOBS" install)
fi

# openconnect: the command line program. With --script-tun it runs the script through /bin/sh, which Android
# doesn't have: _PATH_BSHELL is /system/bin/sh there (and /bin/sh elsewhere).
echo "openconnect $OPENCONNECT_VERSION"
unpack "openconnect-$OPENCONNECT_VERSION.tar.gz" openconnect
python3 - openconnect/tun.c openconnect/script.c <<'PY'
import sys
from pathlib import Path
for name in sys.argv[1:]:
    path = Path(name)
    text = path.read_text()
    old = 'execl("/bin/sh", "/bin/sh", "-c", '
    if text.count(old) != 1 or "#include <paths.h>" in text:
        sys.exit(f"{name} changed: check the /bin/sh patch")
    text = text.replace(old, 'execl(_PATH_BSHELL, "sh", "-c", ')
    path.write_text(text.replace('#include "openconnect-internal.h"', '#include "openconnect-internal.h"\n\n#include <paths.h>', 1))
PY
(cd openconnect && quiet ../openconnect.log ./configure "${CONFIGURE_HOST[@]}" --prefix="$PREFIX" --disable-shared \
	--enable-static --without-gnutls --with-vpnc-script=/system/bin/false --disable-nls --without-lz4 \
	--without-libproxy --without-stoken --without-libpcsclite --without-libpskc --without-gssapi --without-java \
	--with-builtin-json --disable-docs --disable-vhost-net &&
	quiet ../openconnect.log make -j"$JOBS" openconnect)
# libtool's wrapper script stands in for the program until it is installed; the real one is in .libs when shared
OC=openconnect/openconnect
[ -f openconnect/.libs/openconnect ] && OC=openconnect/.libs/openconnect

# ocproxy: its own lwIP copy and one program, built without its autotools files (they are not in the tarball)
echo "ocproxy ${OCPROXY_COMMIT:0:7}"
unpack "ocproxy-$OCPROXY_COMMIT.tar.gz" ocproxy
LWIP_C=$(sed -n '/^LWIP_SOURCES/,/^$/p' ocproxy/Makefile.am | grep -o '[^[:space:]]*\.c')
(cd ocproxy && quiet ../ocproxy.log "$CC" $CFLAGS -std=gnu99 -Dunix -DIPv4 -Ilwip/src -Ilwip/src/include \
	-Ilwip/src/include/ipv4 -Ilwip/src/include/ipv6 -Icontrib/ports/unix/include -Isrc -I"$PREFIX/include" \
	$LWIP_C src/ocproxy.c "$PREFIX/lib/libevent_core.a" $LDFLAGS -o ocproxy)

if [ -n "$HOST" ]; then
	install -m 755 "$OC" "$OUT/libhpchub_openconnect.so"
	install -m 755 ocproxy/ocproxy "$OUT/libhpchub_ocproxy.so"
	"$STRIP" "$OUT"/libhpchub_*.so
	# their licenses go in the APK too (mobile/vpn/THIRD_PARTY.md lists them)
	LICENSES=$ROOT/mobile/src-tauri/gen/android/app/src/main/assets/licenses/vpn
	rm -rf "$LICENSES" && mkdir -p "$LICENSES"
	cp openconnect/COPYING.LGPL "$LICENSES/openconnect.txt"
	cp openconnect/json/LICENSE "$LICENSES/openconnect-json-parser.txt"
	cp openssl/LICENSE.txt "$LICENSES/openssl.txt"
	cp libxml2/Copyright "$LICENSES/libxml2.txt"
	cp zlib/LICENSE "$LICENSES/zlib.txt"
	cp libevent/LICENSE "$LICENSES/libevent.txt"
	cp ocproxy/LICENSE "$LICENSES/ocproxy.txt"
	cp ocproxy/lwip/COPYING "$LICENSES/lwip.txt"
	cp "$HERE/THIRD_PARTY.md" "$LICENSES/README.md"
else
	install -m 755 "$OC" "$OUT/openconnect"
	install -m 755 ocproxy/ocproxy "$OUT/ocproxy"
fi
echo "VPN programs in $OUT:"
ls -l "$OUT"
