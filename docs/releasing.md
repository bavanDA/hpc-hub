# Releasing a version

HPC Hub updates itself: a little after it starts, and twice a day, it reads
`https://github.com/bavanDA/hpc-hub/releases/latest/download/latest.json`. When that names a newer version, the
sidebar shows **Update to x.y.z**; one click downloads it, checks its signature, installs it and restarts the app.
Work on the clusters keeps running meanwhile. This works for the AppImage, the Windows installers and the macOS app;
`.deb` and `.rpm` installs take updates from their download page (or a package repository, later).

## Once: the update key

Updates are signed, and the app installs only what this key signed. Its public half is in
`app/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the private half is kept on your computer in
`~/.tauri/hpc-hub-updater.key` (never in the repository). Losing it means users have to install the next version by
hand, so keep a copy somewhere safe, such as a password manager.

Give it to GitHub Actions once:

    gh secret set TAURI_SIGNING_PRIVATE_KEY -R bavanDA/hpc-hub < ~/.tauri/hpc-hub-updater.key

The key has no password, so nothing else is needed: the workflow passes an empty password when the
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret doesn't exist. (Set that secret only if you make a key with a password;
`gh secret set` asks for the value when `--body ""` is empty.)

## Once: the Mac signing certificate

The Mac app is signed with HPC Hub's own code-signing certificate, made once with openssl ("HPC Hub Self Signed",
valid until 2046). It is not Apple's, so macOS still warns on the first open, but every build is then the same app to
macOS: the Keychain asks once ("Always Allow") instead of after every update. The certificate and key are in
`~/.tauri/hpc-hub-macos-signing.p12`, its password in `~/.tauri/hpc-hub-macos-signing.password` (never in the
repository; back them up with the update key). GitHub Actions has them as two secrets:

    base64 -w0 ~/.tauri/hpc-hub-macos-signing.p12 | gh secret set MACOS_SIGN_P12 -R bavanDA/hpc-hub
    gh secret set MACOS_SIGN_P12_PASSWORD -R bavanDA/hpc-hub < ~/.tauri/hpc-hub-macos-signing.password

Without them the Mac build is not signed (as before). Losing the certificate means one more Keychain question per
saved password after the next update, nothing worse. An Apple Developer ID ($99 a year) would replace it later.

## Each release

1. Raise the version in the files the last `chore(release)` commit changed (`app/src-tauri/tauri.conf.json`,
   `app/src-tauri/Cargo.toml`, `app/package.json`, `hpc_hub/__init__.py`, and the `mobile/` ones), commit and push.
2. Run the **Build** workflow on that branch with **publish** ticked, all three systems, and a line in **notes**:

       gh workflow run build.yml -R bavanDA/hpc-hub --ref <branch> -f publish=true -f notes="Fixes for VS Code"

The `release` job then makes a normal GitHub release `v<version>` with the installers, `SHA256SUMS.txt` and
`latest.json` (made by `packaging/release.py`). It must not be a pre-release: `releases/latest` skips those, so the
apps would never see it. Everyone running an earlier version gets the Update button within half a day.

Versions released before 0.2.1 have no updater, so their users install 0.2.1 once by hand.
