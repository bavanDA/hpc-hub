# HPC Hub on Android

## Goal

A phone app made for a phone, for Google Play and F-Droid, that shares the logic with the desktop app instead of
copying it. App id `io.github.bavanda.hpchub` (permanent), license MIT.

## Shape

    hpc_hub/                 Python logic, shared with the desktop
    app/src/                 desktop screens; mobile uses rpc.ts, hooks.ts, types/, components/terminals/pty.ts
    mobile/                  everything Android
      src/                   phone screens: bottom tabs, full-screen sheets, terminal key row
      src-tauri/             Tauri shell (Rust): starts the backend, keeps the vault key
      src-tauri/gen/android/ the Gradle project (Tauri generates it)
      launcher/              a tiny C program that runs Python: `libhpchub_backend.so`
      python/                builds the Python bundle (stdlib, hpc_hub, asyncssh, cryptography)
      metadata/              store text and screenshots (fastlane layout, read by Play and F-Droid)

Rule: `mobile/` uses `hpc_hub/` and the shared parts of `app/src/`, never edits them. Something new the phone needs
from the logic is added to `hpc_hub/` as a normal feature, behind a setting or an environment variable.

## How it runs

- **Backend:** the same `python -m hpc_hub.api`, JSON-RPC over stdin/stdout, as on the desktop. Python 3.14 for
  Android (python.org) has no `python` program, so `launcher/` is one: `Py_BytesMain` linked to `libpython3.14.so`.
  It ships as `libhpchub_backend.so` in the APK's native libraries, the one folder Android lets an app run
  programs from. `sys.executable` is the launcher, so code that starts Python helpers keeps working.
- **Python files:** stdlib and site-packages ship as an asset zip per processor (`python-<abi>.zip`), unpacked
  into the app's private folder on first start and after an update. Native libraries must be unpacked on
  install too (`useLegacyPackaging`), or there is no launcher file to run.
- **Environment:** `HOME`, `XDG_*` point into the app's private folder; `HPC_HUB_SSH=asyncssh` (no OpenSSH on
  Android; the same path as Windows); `HPC_HUB_VAULT_KEY` (below).
- **UI link:** `rpc_send` and the `rpc` event, as on the desktop, so `app/src/rpc.ts` works unchanged. Terminals are
  asyncssh PTY channels the backend streams (`terminals.open_channel`), which `pty.ts` already handles.
- **Logins:** scanned from the desktop. Its menu has Set up the phone app, which shows a QR code with your
  usernames and passwords (core/pairing.py); a cluster that takes SSH keys (`key_login`, e.g. SDSC) gets a new
  key for the phone instead, added there over the desktop's connection (core/ssh_keys.py). The code works for 10
  minutes and hides after a minute. Typing the login on the phone works too. The camera scan is ZXing (open
  source, for F-Droid), in `ScanPlugin.kt`.
- **Passwords:** an encrypted file (AES-GCM) in the app's private folder. Its key is random, wrapped by an Android
  Keystore key that never leaves the phone's secure hardware; the shell unwraps it at start and hands it to the
  backend. Backup is off for that file, so it never leaves the phone either.

## Screens

Bottom tabs: Clusters, Jobs, Terminals, Files, More (Projects, Globus, LaTeX, Usage, Settings). Touch targets at
least 44 px, dialogs as full-screen sheets, a key row over the keyboard in terminals (Esc, Tab, Ctrl, arrows).
`npm run dev` in `mobile/` shows them in a browser with the desktop's demo data.

## VPN (later)

Android's `VpnService` with libopenconnect built for Android. Sign-in pages open in an Android WebView, the cookie
goes to openconnect as on Windows and macOS. Play asks for a declaration for VPN apps; if it says no, the `play`
build leaves the VPN out and the `fdroid` build keeps it. Until then: SDSC anywhere, Wulver on campus Wi-Fi.

## Builds

- **Local:** Python from the python.org Android release (checksum pinned), `cryptography` built with cibuildwheel,
  APK installed over USB with adb. No GitHub minutes.
- **F-Droid:** builds from source: Python with CPython's `Android/android.py`, `cryptography` from source, the
  Tauri app as other Tauri apps on F-Droid do. Nothing prebuilt in git.
- **Flavors:** `play` and `fdroid` differ only in signing and the VPN switch above.
- **Releases:** tags `vX.Y.Z`; versionCode from the tag.

## Build it

    mobile/python/build.sh arm64-v8a          # Python bundle and launcher into the Android project
    cd mobile && npx tauri android build --debug --apk --target aarch64
    adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

Needs `ANDROID_HOME`, `NDK_HOME` (NDK 27.3), a JDK with javac (`JAVA_HOME`, e.g. Android Studio's `jbr`), and
python3 3.14 on PATH for the wheels.
