# VPN on Windows and macOS: openconnect and a one-time helper

On Linux, NetworkManager runs the tunnel for the user (connect/vpn.py). Windows and macOS have nothing like it:
making a tunnel needs admin rights. So:

1. **Sign-in runs as you**, as on Linux: `openconnect --authenticate` (password and Duo), or the in-app web
   sign-in for SAML gateways (vpn_sso.py). The result is a session cookie, the server's certificate pin and the
   host. openconnect ships inside the app (`<resources>/vpn/`).
2. **A small helper runs the tunnel as admin**: a Windows service or a macOS launchd daemon. It only starts and
   stops `openconnect --cookie-on-stdin` for gateways it was told about at install time.
3. **It is installed once**, the first time you connect a cluster with a VPN: the app asks, then Windows (UAC) or
   macOS (password) asks for permission once. An app update with a newer helper asks again.

## Files

| | Windows | macOS |
|---|---|---|
| Helper, openconnect, scripts (admin-owned copy) | `C:\Program Files\HPC Hub VPN\` | `/Library/Application Support/HPC Hub VPN/` |
| Service | `HpcHubVpn` (LocalSystem, automatic) | `/Library/LaunchDaemons/org.hpchub.vpn.plist` (root, RunAtLoad, KeepAlive) |
| Where the app talks to it | named pipe `\\.\pipe\hpc-hub-vpn` | Unix socket `/var/run/hpc-hub-vpn.sock` |
| Config (admin-only) | `config.json` in the install folder | `config.json` in the install folder |

Inside the install folder: `hpc-hub-vpn-helper[.exe]`, `openconnect/` (the copy of `<resources>/vpn/openconnect/`:
the openconnect program, its libraries, `vpnc-script` (macOS) or `vpnc-script-win.js` + `wintun.dll` (Windows),
and our wrapper `hpchub-script.sh` / `hpchub-script.js`), and `config.json`.

The helper never runs anything from a folder the user can write: install copies everything into the admin-owned
folder, and the service runs only that copy.

## config.json

```json
{"version": 1,
 "users": ["S-1-5-21-...-1001"],            // Windows SIDs, or macOS uids as strings, allowed to ask
 "gateways": ["vpn.njit.edu", "access.yale.edu"]}
```

## Command line

```
hpc-hub-vpn-helper install --user <uid|SID> --gateway <host> [--gateway <host>...] --from <resources/vpn dir>
hpc-hub-vpn-helper uninstall
hpc-hub-vpn-helper serve [--socket <path>] [--config <path>] [--dir <install dir>]   # what the service runs
hpc-hub-vpn-helper --version                                                       # prints the version, exits 0
```

`install` must run as admin (the app starts it elevated). It copies itself and `--from` into the install folder,
writes config.json, registers the service/daemon and starts it; run again, it replaces all of them (upgrade).
`serve` without options uses the platform paths above; tests run it on Linux with `--socket` and `--config`, and
`--dir` pointing at a folder with a fake `openconnect/openconnect`.

## Protocol

One request per connection: the client writes one JSON line, the helper answers one JSON line and closes.
Every answer has `"ok": true|false`, and `"error": "<text>"` when false.

| Request | Answer |
|---|---|
| `{"op": "version"}` | `{"ok": true, "version": "1"}` |
| `{"op": "status"}` | `{"ok": true, "state": "down"\|"connecting"\|"up", "gateway": "<host>", "error": "<last failure>", "log": ["<last 30 lines>"]}` |
| `{"op": "up", ...}` | `{"ok": true}` once openconnect is started; poll `status` until `up`, or `down` with an error |
| `{"op": "down"}` | `{"ok": true}` once openconnect has stopped |

`up` fields: `url` (the gateway, `https://host[/path]`), `cookie`, `servercert` (`pin-sha256:...`), `useragent`,
`protocol` (`anyconnect`, `gp`, `nc`, `pulse`, `f5`, `fortinet`, `array`), `resolve` (`host:ip`, may be empty),
`routes` (list of CIDRs; empty: the routes the server pushes) and `domains` (list of DNS domains for split DNS).

The helper refuses (`ok: false`) when: the caller is not in `users` (macOS: the socket's peer uid; Windows: the
pipe's client SID); the url's host is not in `gateways` (case-insensitive) or the scheme is not https; any string
has a newline or NUL, or is over 8 KB; a route is not a CIDR; a domain is not `[A-Za-z0-9.-]+`. One tunnel at a
time: `up` while one runs stops the old one first.

It runs, from the install folder, with the cookie on stdin:

```
openconnect --protocol <p> --useragent <ua> --servercert <pin> --cookie-on-stdin --non-inter
            --script <wrapper> [--resolve <host:ip>] <url>
```

with environment `HPCHUB_ROUTES="<cidr> <cidr>..."` and `HPCHUB_DOMAINS="<d> <d>..."` (both may be empty),
which openconnect passes on to the script. The wrapper sets `CISCO_SPLIT_INC` / `CISCO_SPLIT_INC_<n>_ADDR` /
`_MASK` / `_MASKLEN` from `HPCHUB_ROUTES` (only when it isn't empty) and `CISCO_SPLIT_DNS` from `HPCHUB_DOMAINS`,
then runs the real vpnc-script. State becomes `up` when openconnect prints a line starting `Configured as` (or the
script runs with `reason=connect`), and `down` with the last error line when openconnect exits.

`down` stops openconnect politely first (SIGINT on macOS, so vpnc-script removes routes and DNS; on Windows the
best that works), then kills it after 5 seconds.
