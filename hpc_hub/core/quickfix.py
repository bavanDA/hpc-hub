"""Quick fixes: a fix to the app's screens or its Python reaches it in about a minute, without a new build. One is a
zip next to the beta's installers (packaging/quick_fix.py) with ui/ (the window's files) and py/hpc_hub/ (this
package), for exactly one version, signed with the update key like every update. A beta reads quick-fix.json, a
release quick-fix-release.json, so each kind of version has its own.

Kept in HPC_HUB_QUICKFIX_DIR (the app's data folder, set by the window, release builds only): <number>/ui, <number>/py
and current.json naming the one in use. The window serves ui/ (app/src-tauri/src/quickfix.rs) and starts the
backend with py/ first on its path (packaging/backend.py); a start that never gets going drops the fix by itself."""

import base64
import hashlib
import io
import json
import os
import shutil
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

FEED = "https://github.com/bavanDA/hpc-hub/releases/download/beta/quick-fix.json"
RELEASE_FEED = "https://github.com/bavanDA/hpc-hub/releases/download/beta/quick-fix-release.json"
# the update key's public half, the same as plugins.updater.pubkey in app/src-tauri/tauri.conf.json
PUBKEY = ("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDlDOEU3QkFCQzNGMDgxMzQKUldRMGdmRERxM3VPbkw2d3BJY2xpenRu"
          "VFFmZjNhZW9xbTdYb1BpYSsrR1BlalBxWVA5ZURsQncK")
MAX_ZIP = 60 * 1024 * 1024
MAX_FILES = 5000
TIMEOUT = 30
CURRENT = "current.json"


class BadFix(Exception):
    """Not a quick fix this app takes: a bad signature, or a zip that isn't one."""


def folder() -> Path | None:
    """Where quick fixes are kept; None in a build that can't use them (a debug build, a browser)."""
    d = os.environ.get("HPC_HUB_QUICKFIX_DIR", "")
    return Path(d) if d else None


def app_version() -> str:
    """The installed app's own version: a quick fix carries this package, so __version__ can't be trusted for it."""
    from .. import __version__

    return os.environ.get("HPC_HUB_APP_VERSION") or __version__


def current(root: Path) -> dict | None:
    """The fix in use: {"base", "number", "notes"}, when it is for this version and its files are there."""
    try:
        cur = json.loads((root / CURRENT).read_text(encoding="utf-8"))
        number = int(cur["number"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if cur.get("base") != app_version() or not (root / str(number)).is_dir():
        return None
    return {"base": cur["base"], "number": number, "notes": str(cur.get("notes", ""))}


def label() -> str:
    """The version for bug reports: "0.2.6-beta.46 fix 3" with a quick fix in use."""
    n = running()
    return f"{app_version()} fix {n}" if n else app_version()


def failed(root: Path) -> set[int]:
    """Fixes the app dropped because a start with them never got going (quickfix.rs): never offered again."""
    try:
        return {int(n) for n in (root / "failed").read_text().split() if n.isdigit()}
    except OSError:
        return set()


def running() -> int | None:
    """The fix this start runs with (it may be older than current(): a newer one waits for the next start)."""
    n = os.environ.get("HPC_HUB_QUICKFIX_NUMBER", "")
    return int(n) if n.isdigit() else None


# minisign, as `tauri signer sign` writes it (the format the updater checks): the public key is "Ed" + 8 bytes key id
# + 32 bytes key; a signature is "ED" (the file's BLAKE2b-512 signed) or "Ed" (the file itself) + key id + 64 bytes,
# then a trusted comment and a second signature over the first one and that comment.
def _lines(b64: str) -> list[str]:
    try:
        return base64.b64decode(b64).decode().splitlines()
    except (ValueError, UnicodeDecodeError):
        raise BadFix("The signature can't be read") from None


def verify(data: bytes, signature: str, pubkey: str = "") -> None:
    """Raises BadFix unless data is signed with the update key."""
    key = base64.b64decode(_lines(pubkey or PUBKEY)[1])
    lines = _lines(signature)
    if len(lines) < 4 or not lines[2].startswith("trusted comment: "):
        raise BadFix("The signature can't be read")
    try:
        sig, glob = base64.b64decode(lines[1]), base64.b64decode(lines[3])
    except ValueError:
        raise BadFix("The signature can't be read") from None
    if len(key) != 42 or len(sig) != 74 or sig[2:10] != key[2:10]:
        raise BadFix("Signed with another key")
    alg = sig[:2]
    if alg not in (b"ED", b"Ed"):
        raise BadFix("The signature can't be read")
    signed = hashlib.blake2b(data, digest_size=64).digest() if alg == b"ED" else data
    pk = Ed25519PublicKey.from_public_bytes(key[10:])
    try:
        pk.verify(sig[10:], signed)
        pk.verify(glob, sig[10:] + lines[2][len("trusted comment: "):].encode())
    except InvalidSignature:
        raise BadFix("The signature doesn't match") from None


def _get(url: str, limit: int) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": f"HPC Hub/{app_version()}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise BadFix("The quick fix is too big")
    return data


def offered(feed: dict, root: Path) -> dict | None:
    """The fix the feed offers, when it's for this version and newer than the one in use."""
    try:
        number = int(feed["number"])
    except (KeyError, TypeError, ValueError):
        return None
    if feed.get("base") != app_version() or not feed.get("url") or not feed.get("signature"):
        return None
    cur = current(root)
    if cur and cur["number"] >= number or number in failed(root):
        return None
    return {"number": number, "notes": str(feed.get("notes", "")), "url": feed["url"],
            "signature": feed["signature"], "base": feed["base"]}


def feed_url() -> str:
    """A beta (1.2.3-beta.4) reads the beta's fixes, a release (1.2.3) the release's."""
    return FEED if "-" in app_version() else RELEASE_FEED


def check(fetch=_get) -> dict | None:
    """The newer quick fix for this version, if there is one. None when there's none (or no feed yet)."""
    root = folder()
    if root is None:
        return None
    try:
        feed = json.loads(fetch(feed_url(), 256 * 1024))
    except urllib.error.HTTPError as e:
        if e.code == 404:  # no quick fixes for this kind of version yet
            return None
        raise
    return offered(feed, root) if isinstance(feed, dict) else None


def unpack(data: bytes, into: Path) -> None:
    """The zip's ui/ and py/ into into/, which must not exist yet. Nothing outside it is ever written."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise BadFix("The quick fix isn't a zip") from None
    names = z.namelist()
    if len(names) > MAX_FILES:
        raise BadFix("The quick fix has too many files")
    for name in names:
        parts = Path(name).parts
        if name.startswith(("/", "\\")) or ".." in parts or ":" in name or not parts or parts[0] not in ("ui", "py"):
            raise BadFix(f"The quick fix has a file it shouldn't: {name}")
    if "ui/index.html" not in names and "py/hpc_hub/__init__.py" not in names:
        raise BadFix("The quick fix is empty")
    tmp = into.with_name(into.name + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    z.extractall(tmp)
    tmp.rename(into)


def install(fix: dict, fetch=_get) -> dict:
    """Download, check the signature, unpack and make it the one in use from the next start. Returns current()."""
    root = folder()
    if root is None:
        raise BadFix("This build of HPC Hub can't take quick fixes")
    data = fetch(fix["url"], MAX_ZIP)
    verify(data, fix["signature"])
    root.mkdir(parents=True, exist_ok=True)
    into = root / str(int(fix["number"]))
    shutil.rmtree(into, ignore_errors=True)
    unpack(data, into)
    tmp = root / (CURRENT + ".part")
    tmp.write_text(json.dumps({"base": fix["base"], "number": int(fix["number"]), "notes": fix.get("notes", "")}),
                   encoding="utf-8")
    os.replace(tmp, root / CURRENT)
    tidy(root)
    return current(root) or {}


def tidy(root: Path) -> None:
    """Older fixes go; the one in use stays (and the one running now, until the next start)."""
    cur = current(root)
    keep = {str(cur["number"])} if cur else set()
    now = str(running())
    for d in root.iterdir():
        if d.is_dir() and d.name not in keep and d.name != now:
            shutil.rmtree(d, ignore_errors=True)
