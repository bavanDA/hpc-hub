# HPC Hub on macOS, Windows and Linux (Tauri)

## Goal

One app that looks good on all three systems. The screens are rebuilt as a web UI in Tauri; the Python logic stays.

## Shape

    app/ui/          React + TypeScript screens (Vite, Tailwind)
    app/src-tauri/   Tauri shell (Rust): windows, the Python backend as a sidecar, terminals (PTY)
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

## Order

Each step ships with the GTK app still working, until the Tauri app has every page.

1. Skeleton: Tauri window, Python backend over JSON-RPC, CI on all three systems.
2. Clusters: connect, Duo, compute node.
3. Jobs and usage.
4. Projects.
5. Files, copies and Globus.
6. Terminals.
7. Agents, permissions.
8. Experimental: LaTeX, skills, scheduled agents.
9. macOS: Keychain, VPN.
10. Windows: SSH backend, VPN.
11. Remove the GTK screens.
