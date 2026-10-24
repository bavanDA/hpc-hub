# HPC Hub on macOS, Windows and Linux (Tauri)

## Goal

One app that looks good on all three systems. The screens are rebuilt as a web UI in Tauri; the Python logic stays.

## Shape

    app/src/         React + TypeScript screens (Vite, Tailwind, lucide icons)
    app/src-tauri/   Tauri shell (Rust): the window, the Python backend as a child process, terminals (PTY)
    hpc_hub/         Python logic, unchanged where possible
    hpc_hub/api/     JSON-RPC over stdin/stdout: the UI calls methods, the backend sends events

- **Calls:** the UI sends `{"method": "jobs.list", "params": {...}}`; Python answers. Long work runs on threads.
- **Events:** session state, logs, transfer progress and Duo prompts are pushed as notifications.
- **Terminals:** xterm.js in the UI, a real PTY in Rust running `ssh` (ConPTY on Windows).
- **PDFs:** PDF.js (already web). **Editor:** CodeMirror 6. **Sign-in pages:** a Tauri webview window.
- **Packaging:** the Python backend is frozen with PyInstaller per system. GitHub Actions builds `.dmg`,
  `.msi`, `.AppImage`, `.deb` and `.rpm`, and runs the tests on all three systems.

## What changes per system

| Piece | Linux | macOS | Windows |
|---|---|---|---|
| Secrets | `keyring` (Secret Service) | `keyring` (Keychain) | `keyring` (Credential Manager) |
| SSH | OpenSSH ControlMaster | OpenSSH ControlMaster | asyncssh (no ControlMaster in Windows OpenSSH) |
| VPN | NetworkManager | openconnect with an admin helper | openconnect + wintun, admin |

## How a feature is built

Each feature touches only its own files, so several can be built at once:

- **Backend:** `hpc_hub/api/methods/<feature>.py` with `@method("<feature>.<verb>")` functions (keyword params,
  plain JSON back). Every module in that folder loads by itself. Live connections: `hub().connected(cluster)`
  gives a connected `ClusterSession` (its `.ssh` runs commands), or raises "Connect to X first". Push events with
  `hub().emit(name, data)`. Reuse the logic modules (`hpc_hub/compute/jobs.py`...); don't copy them.
- **Tests:** `tests/api/test_<feature>.py`, with fakes, never real clusters.
- **Screen:** `app/src/pages/<Page>.tsx`, parts in `app/src/components/<feature>/`, types in
  `app/src/types/<feature>.ts`. Use the shared pieces in `components/ui.tsx` (Card, List, Row, Button, Pill,
  EmptyState, Dialog), `useToast()`, and `useCall` / `useEvent` from `hooks.ts`.
- **Demo data:** `app/src/demo/<feature>.ts` exporting `answers` (method -> result, or a function of params).
  `npm run dev` then shows the page in a plain browser with that data; screenshot it with headless Chrome.
- **Copy:** plain and short, no em or en dashes, made-up names only (jdoe, mygroup, abc123).
- **Don't** connect, disconnect, submit or cancel jobs on the real clusters while building.

## Run it (development)

    cd app && npm install && npm run tauri dev

Linux needs WebKitGTK 4.1 headers: `sudo dnf install webkit2gtk4.1-devel openssl-devel libxdo-devel librsvg2-devel`.

## Build and release

Debug builds run `python3 -m hpc_hub.api` from the repository (`HPC_HUB_PYTHON` picks another Python). Release
builds run `hpc-hub-backend`, the backend frozen with PyInstaller (`packaging/backend.spec`), which Tauri ships
next to the app as a sidecar. It needs no GTK: logins go to the keyring through `secretstorage` on Linux (the same
entries as the GTK app) and `keyring` on macOS and Windows.

Freeze the backend and try it (in a venv of its own; close the Tauri app first, they share the askpass socket):

    pip install -r packaging/requirements-backend.txt
    python packaging/build_backend.py     # writes app/src-tauri/binaries/hpc-hub-backend-<target>
    echo '{"jsonrpc":"2.0","id":1,"method":"app.version"}' | app/src-tauri/binaries/hpc-hub-backend-*
    HPC_HUB_BACKEND=$PWD/app/src-tauri/binaries/hpc-hub-backend-x86_64-unknown-linux-gnu npm run tauri dev  # in app/

Installers on this machine: `cd app && npm run tauri:release` (add `-- --bundles deb` for one kind). They land in
`app/src-tauri/target/release/bundle/`. The sidecar is only added by `packaging/tauri.release.json`, so plain
`cargo build` and `tauri dev` work without a frozen backend.

GitHub Actions:

- `test.yml`, on every push and pull request: pytest and ruff, the web build, `cargo check`.
- `build.yml`, by hand only (Actions, Build, Run workflow, or `gh workflow run build.yml`): installers for Linux
  (`.AppImage`, `.deb`, `.rpm`, built on Ubuntu 22.04), macOS on Apple Silicon (`.dmg`) and Windows (`.msi`,
  `.exe`). The `systems` input picks runners, e.g. `-f systems='["ubuntu-22.04"]'` for Linux only. Download them
  from the run's page, under Artifacts (kept 14 days). Not signed yet, so macOS and Windows warn when you open them.
- **Minutes:** GitHub Pro gives 3000 a month; macOS counts 10x and Windows 2x. A test run is about 2 minutes, a
  full installer build about 110. Keep the account's Actions budget at $0 (Settings, Billing) so going over stops
  the jobs instead of charging.

## Order

Each step ships with the GTK app still working, until the Tauri app has every page.

1. Skeleton: Tauri window, Python backend over JSON-RPC, CI on all three systems. **Done**
2. Clusters: connect, Duo, compute node, VPN web sign-in, portal key, settings, health. **Done**
3. Jobs and usage. **Done**
4. Projects. **Done**
5. Files, copies and Globus. **Done**
6. Terminals. **Done**
7. Agents, VS Code, Ask all, permissions. **Done**
8. Experimental: LaTeX (with PDF viewer), skills, scheduled agents. **Done**
9. macOS: Keychain (done, through `keyring`), VPN (openconnect needs an admin helper), first test on a Mac.
10. Windows: the askpass socket and `getuid` are Unix-only, and Windows OpenSSH has no ControlMaster, so the
    SSH layer needs another way to share one login (asyncssh, or a long-lived ssh per cluster); VPN.
11. Remove the GTK screens, once the Tauri app has been used for real on Linux.
