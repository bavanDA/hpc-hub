"""A quick fix for the current beta (hpc_hub/core/quickfix.py): the window's files (app/dist, built first) and the
hpc_hub package, zipped for apps on exactly that beta, plus quick-fix.json, which those apps read every minute.

    python packaging/quick_fix.py <out folder> <beta version> <number> [notes file] [--check <beta commit>]

The zip is signed with the update key (TAURI_SIGNING_PRIVATE_KEY, as for updates; `tauri signer sign`). --check
refuses a fix that can't work without a new build: one that changes the Rust side, the packaging or the Python
libraries the frozen backend carries. The Quick fix workflow (.github/workflows/quick-fix.yml) runs this."""

import json
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "bavanDA/hpc-hub"
# changed since the beta, these need a new build: the window's Rust, what it bundles, the backend's libraries
NEEDS_BUILD = ("app/src-tauri/", "app/vpn-helper/", "packaging/backend", "packaging/build_backend.py",
               "packaging/requirements-backend.txt", "packaging/tauri.", "pyproject.toml", "bin/")


def needs_build(changed: list[str]) -> list[str]:
    return [f for f in changed if f.startswith(NEEDS_BUILD)]


def files(folder: Path):
    for f in sorted(folder.rglob("*")):
        if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc":
            yield f


def pack(zip_path: Path, dist: Path, package: Path, version: str) -> int:
    """ui/ from the built window, py/hpc_hub/ from the package, its __version__ set to the beta's own."""
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files(dist):
            z.write(f, "ui/" + f.relative_to(dist).as_posix())
            count += 1
        for f in files(package):
            name = "py/hpc_hub/" + f.relative_to(package).as_posix()
            if name == "py/hpc_hub/__init__.py":
                text = f.read_text(encoding="utf-8")
                lines = [f'__version__ = "{version}"' if ln.startswith("__version__ =") else ln
                         for ln in text.splitlines()]
                z.writestr(name, "\n".join(lines) + "\n")
            else:
                z.write(f, name)
            count += 1
    return count


def sign(path: Path) -> str:
    """The base64 minisign signature `tauri signer sign` writes next to the file."""
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    subprocess.run([npx, "tauri", "signer", "sign", str(path)], cwd=ROOT / "app", check=True,
                   stdout=subprocess.DEVNULL)
    sig = path.with_name(path.name + ".sig")
    text = sig.read_text().strip()
    sig.unlink()
    return text


def main() -> int:
    args = list(sys.argv[1:])
    base_commit = ""
    if "--check" in args:
        i = args.index("--check")
        base_commit = args[i + 1]
        del args[i:i + 2]
    if len(args) not in (3, 4):
        print(__doc__, file=sys.stderr)
        return 2
    out, version, number = Path(args[0]), args[1], int(args[2])
    notes = Path(args[3]).read_text(encoding="utf-8").strip() if len(args) == 4 else ""

    if base_commit:
        changed = subprocess.run(["git", "diff", "--name-only", base_commit, "HEAD"], cwd=ROOT, check=True,
                                 capture_output=True, text=True).stdout.split()
        if blocked := needs_build(changed):
            print("This change needs a new beta build, not a quick fix:\n  " + "\n  ".join(blocked), file=sys.stderr)
            return 1

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm, "run", "build"], cwd=ROOT / "app", check=True)
    out.mkdir(parents=True, exist_ok=True)
    zip_path = out / f"quick-fix-{number}.zip"
    count = pack(zip_path, ROOT / "app" / "dist", ROOT / "hpc_hub", version)
    feed = {"base": version, "number": number, "notes": notes or f"Quick fix {number}",
            "url": f"https://github.com/{REPO}/releases/download/beta/{zip_path.name}",
            "signature": sign(zip_path), "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (out / "quick-fix.json").write_text(json.dumps(feed, indent=2) + "\n", encoding="utf-8")
    print(f"Quick fix {number} for {version}: {count} files, {zip_path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
