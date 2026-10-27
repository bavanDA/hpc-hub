#!/usr/bin/env bash
# The backend for the Android app: Python 3.14 for Android, cffi and cryptography built for it, the pure Python
# packages, hpc_hub, and the launcher. Writes, in mobile/src-tauri/gen/android/app/src/main:
#   jniLibs/<abi>/  libpython3.14.so, lib*_python.so, libhpchub_backend.so (the launcher)
#   assets/python-<abi>.zip  the standard library and site-packages, unpacked by PythonSetup.kt
# See docs/design/android.md.
#
#     mobile/python/build.sh [arm64-v8a|x86_64]      (default arm64-v8a; x86_64 is for the emulator)
set -euo pipefail

ABI=${1:-arm64-v8a}
PY_VERSION=3.14.8
LIBFFI_VERSION=3.8.0
LIBFFI_SHA256=7da3e2d9a171eb0a038f592ecad3ff2bb2550f3496d87b3b29ad0cf4430c0db4
CFFI_VERSION=2.1.1
CFFI_SHA256=dd31f52ea1086513bb9df30f8fcee9b8918323ae067a3d5b78bc826a000712be
CRYPTOGRAPHY_VERSION=50.0.2
CRYPTOGRAPHY_SHA256=7b46165bb56eb4704e2eaaf86f3c940d19154535d9b0ca7d6d590b04060e00d5
CIBUILDWHEEL_VERSION=4.3.4
NDK_VERSION=27.3.13750724 # the one Python for Android is built with

case $ABI in
arm64-v8a) HOST=aarch64-linux-android CIBW_ARCH=arm64_v8a PY_SHA256=11324313957da3736f44e90257304d288864321a4dd376ed0cc35a54eacf9a33 ;;
x86_64) HOST=x86_64-linux-android CIBW_ARCH=x86_64 PY_SHA256=58eb3b2d76ef57e076985a0a6b093cf08906d65ea4ab78cccc6d894d4250c972 ;;
*) echo "error: unknown ABI $ABI (arm64-v8a or x86_64)" >&2 && exit 1 ;;
esac

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=$ROOT/mobile/build/python/$ABI
MAIN=$ROOT/mobile/src-tauri/gen/android/app/src/main
: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
NDK=$ANDROID_HOME/ndk/$NDK_VERSION
[ -d "$NDK" ] || "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "ndk;$NDK_VERSION"
CLANG=$(echo "$NDK"/toolchains/llvm/prebuilt/*/bin)
export ANDROID_HOME

die() {
	echo "error: $*" >&2
	exit 1
}

# fetch <url> <sha256> <file>: downloaded once, checked every time
fetch() {
	[ -f "$3" ] || curl -fsSL --retry 3 -o "$3" "$1" || die "could not download $1"
	echo "$2  $3" | sha256sum -c - >/dev/null || die "$1 does not have the expected SHA256 ($2)"
}

mkdir -p "$WORK/downloads" "$WORK/wheels"
cd "$WORK"

# Python for Android (python.org)
fetch "https://www.python.org/ftp/python/$PY_VERSION/python-$PY_VERSION-$HOST.tar.gz" "$PY_SHA256" \
	downloads/python.tar.gz
rm -rf python && mkdir python && tar -xzf downloads/python.tar.gz -C python
PREFIX=$WORK/python/prefix
STDLIB=$PREFIX/lib/python${PY_VERSION%.*}

# Native packages, built with cibuildwheel (it needs a Python $PY_VERSION%.* on this machine)
python3 -c "import sys; sys.exit(sys.version_info[:2] != tuple(map(int, '${PY_VERSION%.*}'.split('.'))))" ||
	die "needs python3 ${PY_VERSION%.*} on PATH to build the wheels"
[ -x venv/bin/cibuildwheel ] || { python3 -m venv venv && venv/bin/pip -q install "cibuildwheel==$CIBUILDWHEEL_VERSION"; }
cibuildwheel() { # <source dir> [env]
	CIBW_BUILD="cp$(echo "${PY_VERSION%.*}" | tr -d .)-*" CIBW_ARCHS=$CIBW_ARCH CIBW_ENVIRONMENT_ANDROID="${2:-}" \
		venv/bin/cibuildwheel --platform android --output-dir wheels "$1"
}

# libffi (static) for cffi
if ! ls wheels/cffi-$CFFI_VERSION-*.whl >/dev/null 2>&1; then
	fetch "https://github.com/libffi/libffi/releases/download/v$LIBFFI_VERSION/libffi-$LIBFFI_VERSION.tar.gz" \
		"$LIBFFI_SHA256" downloads/libffi.tar.gz
	rm -rf libffi-src libffi && mkdir libffi-src && tar -xzf downloads/libffi.tar.gz -C libffi-src --strip-components 1
	(cd libffi-src && ./configure --host="$HOST" --prefix="$WORK/libffi" --disable-shared --enable-static --with-pic \
		--disable-docs --disable-multi-os-directory CC="$CLANG/${HOST}24-clang" AR="$CLANG/llvm-ar" \
		RANLIB="$CLANG/llvm-ranlib" >/dev/null && make -j"$(nproc)" >/dev/null && make install >/dev/null)
	fetch "https://files.pythonhosted.org/packages/source/c/cffi/cffi-$CFFI_VERSION.tar.gz" "$CFFI_SHA256" \
		downloads/cffi.tar.gz
	rm -rf cffi-src && mkdir cffi-src && tar -xzf downloads/cffi.tar.gz -C cffi-src --strip-components 1
	cibuildwheel cffi-src "PKG_CONFIG_PATH=$WORK/libffi/lib/pkgconfig"
fi

if ! ls wheels/cryptography-$CRYPTOGRAPHY_VERSION-*.whl >/dev/null 2>&1; then
	rustup target add "$HOST" >/dev/null # the Rust and Android names are the same for these two
	fetch "https://files.pythonhosted.org/packages/source/c/cryptography/cryptography-$CRYPTOGRAPHY_VERSION.tar.gz" \
		"$CRYPTOGRAPHY_SHA256" downloads/cryptography.tar.gz
	rm -rf cryptography-src && mkdir cryptography-src
	tar -xzf downloads/cryptography.tar.gz -C cryptography-src --strip-components 1
	# cibuildwheel points PYO3_CROSS_LIB_DIR at prefix/lib, where cryptography-cffi expects prefix/lib/python3.X
	# when it looks for Python.h
	python3 - "$PY_VERSION" cryptography-src/src/rust/cryptography-cffi/build.rs <<'PY'
import sys
from pathlib import Path
version, path = ".".join(sys.argv[1].split(".")[:2]), Path(sys.argv[2])
old = '''    let python_includes = if let Ok(lib_dir) = env::var("PYO3_CROSS_LIB_DIR") {
        let lib = Path::new(&lib_dir);'''
new = old.replace("        let lib = ", f'''        let lib_dir = if lib_dir.ends_with("/lib") {{ format!("{{lib_dir}}/python{version}") }} else {{ lib_dir }};
        let lib = ''')
text = path.read_text()
if text.count(old) != 1:
    sys.exit("cryptography's build.rs changed: check the Python.h patch")
path.write_text(text.replace(old, new))
PY
	cibuildwheel cryptography-src
fi

# The bundle: standard library without what an app never uses, then site-packages
rm -rf stage && mkdir -p stage/lib
cp -r "$STDLIB" stage/lib/
LIB=stage/lib/$(basename "$STDLIB")
rm -rf "$LIB"/{test,idlelib,tkinter,turtledemo,ensurepip,pydoc_data,site-packages}
SITE=$LIB/site-packages
mkdir -p "$SITE"
for whl in wheels/cffi-$CFFI_VERSION-*.whl wheels/cryptography-$CRYPTOGRAPHY_VERSION-*.whl; do
	python3 -m zipfile -e "$whl" "$SITE"
done
venv/bin/python -m pip download -q --no-deps --only-binary :all: --require-hashes -r "$HERE/requirements.txt" -d pure
for whl in pure/*.whl; do python3 -m zipfile -e "$whl" "$SITE"; done
# hpc_hub without the GTK app (its screens and the GTK entry point)
(cd "$ROOT" && find hpc_hub -type f ! -path '*/__pycache__/*' ! -path '*/ui/*' ! -path 'hpc_hub/app.py' \
	! -path 'hpc_hub/__main__.py' -print0 | xargs -0 -I{} cp --parents {} "$WORK/$SITE/")
find stage -name __pycache__ -prune -exec rm -rf {} +
# compiled ahead of time; unchecked-hash: the unpacked files' times don't matter
python3 -m compileall -q -j0 --invalidation-mode unchecked-hash stage/lib >/dev/null
rm -f bundle.zip && (cd stage && python3 -m zipfile -c ../bundle.zip lib)

# Into the Android project
mkdir -p "$MAIN/assets" "$MAIN/jniLibs/$ABI"
rm -f "$MAIN/jniLibs/$ABI"/*.so
cp bundle.zip "$MAIN/assets/python-$ABI.zip"
cp "$PREFIX"/lib/libpython${PY_VERSION%.*}.so "$PREFIX"/lib/lib*_python.so "$MAIN/jniLibs/$ABI/"
"$CLANG/${HOST}24-clang" -O2 -fPIE -pie -I"$PREFIX/include/python${PY_VERSION%.*}" "$ROOT/mobile/launcher/main.c" \
	-L"$PREFIX/lib" -lpython${PY_VERSION%.*} -Wl,-z,max-page-size=16384 -o "$MAIN/jniLibs/$ABI/libhpchub_backend.so"
echo "Python bundle: $(du -h "$MAIN/assets/python-$ABI.zip" | cut -f1), native libraries:"
ls -1 "$MAIN/jniLibs/$ABI"
