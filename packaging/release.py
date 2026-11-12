"""The files of a GitHub release from what the Build workflow made, and latest.json, which the app's updater reads
(github.com/<repo>/releases/latest/download/latest.json, see app/src-tauri/tauri.conf.json).

    python packaging/release.py <folder with the build's files> <out folder> <version> [notes file]

Each installer gets a plain name (HPC-Hub_<version>_<system>_<arch>.<ext>). An installer with a .sig next to it
(the update signature, made with the TAURI_SIGNING_PRIVATE_KEY secret) is offered as an update for its platform; its
signature goes into latest.json, not into the release. SHA256SUMS.txt lists them all. install.ps1, the Windows
one-line installer, goes along."""

import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

REPO = "bavanDA/hpc-hub"
NEEDED = ("linux-x86_64", "windows-x86_64", "darwin-aarch64")  # the systems every release must update
# (end of the built file's name, the release's name for it after the version, updater platform keys)
KINDS = [
    (".AppImage", "linux_x86_64.AppImage", ["linux-x86_64"]),
    (".deb", "linux_amd64.deb", ["linux-x86_64-deb"]),
    (".rpm", "linux_x86_64.rpm", ["linux-x86_64-rpm"]),
    ("-setup.exe", "windows_x64-setup.exe", ["windows-x86_64", "windows-x86_64-nsis"]),
    (".msi", "windows_x64.msi", ["windows-x86_64-msi"]),
    (".dmg", "macos_apple-silicon.dmg", []),  # installs by hand; the update is the .app.tar.gz
    (".app.tar.gz", "macos_apple-silicon.app.tar.gz", ["darwin-aarch64"]),
]


def collect(src: Path, out: Path, version: str, notes: str, date: str) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    base = f"https://github.com/{REPO}/releases/download/v{version}"
    platforms, sums = {}, []
    for f in sorted(p for p in Path(src).rglob("*") if p.is_file() and not p.name.endswith(".sig")):
        kind = next((k for k in KINDS if f.name.endswith(k[0])), None)
        if not kind:
            continue
        name = f"HPC-Hub_{version}_{kind[1]}"
        shutil.copyfile(f, out / name)
        sums.append(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {name}")
        sig = f.with_name(f.name + ".sig")
        if sig.exists():
            for key in kind[2]:
                platforms[key] = {"url": f"{base}/{name}", "signature": sig.read_text().strip()}
    if not platforms:
        raise SystemExit("There are no update signatures: is the TAURI_SIGNING_PRIVATE_KEY secret set?")
    missing = [p for p in NEEDED if p not in platforms]
    if missing:  # a partial latest.json gives those users updater errors: every system, or no release
        raise SystemExit(f"No signed update for {', '.join(missing)}: build every system before publishing.")
    latest = {"version": version, "notes": notes, "pub_date": date, "platforms": platforms}
    (out / "latest.json").write_text(json.dumps(latest, indent=2) + "\n")
    # the Windows one-liner: irm .../releases/latest/download/install.ps1 | iex (it checks the installers against
    # SHA256SUMS.txt, so it isn't in that list itself)
    shutil.copyfile(Path(__file__).with_name("install.ps1"), out / "install.ps1")
    (out / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n")
    return latest


if __name__ == "__main__":
    src, out, version = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    notes = Path(sys.argv[4]).read_text().strip() if len(sys.argv) > 4 else ""
    collect(src, out, version, notes, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
