"""Settings > Back up: HPC Hub's settings and saved logins in one file locked with a password you choose, to keep
somewhere safe or bring to another computer, and to import back.

What goes in: the settings files (~/.config/hpc-hub: clusters, app settings, projects, layout) and the logins HPC Hub
saved in the system keyring (each cluster's SSH and VPN login, the Globus sign-in). Not: SSH keys in ~/.ssh (yours,
not HPC Hub's), anything on the clusters.

The file is JSON: a header (format, scrypt settings, salt, nonce) and the contents sealed with AES-256-GCM under a key
scrypt makes from the password; the header is checked with it, so it can't be changed either. Without the password
the file tells nothing but that it is an HPC Hub backup."""

import base64
import json
import os
import shutil
import time
from pathlib import Path

from . import credentials
from .config import CONFIG_DIR

FORMAT = "hpc-hub-backup"
SUFFIX = ".hpchub"
MIN_PASSWORD = 8
SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1}  # about 32 MB and a fraction of a second, per try
MAX_FILE = 20_000_000
MAX_MEMORY = 256 * 1024 * 1024  # what opening a file may cost at most, whatever its header asks
FILE_TYPES = (".toml", ".json")  # the settings files; backups like clusters.toml.bak-* stay out


class BackupError(Exception):
    pass


class WrongPassword(BackupError):
    pass


def _key(password: str, salt: bytes, kdf: dict) -> bytes:
    """Python's own scrypt (the frozen app always has it): 128 * r * n bytes of memory."""
    import hashlib
    return hashlib.scrypt(password.encode(), salt=salt, n=kdf["n"], r=kdf["r"], p=kdf["p"],
                          maxmem=2 * MAX_MEMORY, dklen=32)


def seal(contents: dict, password: str) -> bytes:
    """The file's bytes: contents locked with password."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if len(password) < MIN_PASSWORD:
        raise BackupError(f"Use a password of at least {MIN_PASSWORD} characters")
    salt, nonce = os.urandom(16), os.urandom(12)
    header = {"format": FORMAT, "v": 1, "kdf": {"name": "scrypt", **SCRYPT},
              "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode()}
    aad = json.dumps(header, sort_keys=True).encode()
    data = AESGCM(_key(password, salt, SCRYPT)).encrypt(nonce, json.dumps(contents).encode(), aad)
    return json.dumps({**header, "data": base64.b64encode(data).decode()}, indent=1).encode()


def unseal(blob: bytes, password: str) -> dict:
    """The contents; WrongPassword, or BackupError for a file that isn't an HPC Hub backup."""
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        whole = json.loads(blob)
        header = {k: whole[k] for k in ("format", "v", "kdf", "salt", "nonce")}
        if header["format"] != FORMAT or header["v"] != 1 or header["kdf"].get("name") != "scrypt":
            raise ValueError
        kdf = {k: int(header["kdf"][k]) for k in ("n", "r", "p")}
        if not (2 ** 10 <= kdf["n"] <= 2 ** 20 and 1 <= kdf["r"] <= 32 and 1 <= kdf["p"] <= 16
                and 128 * kdf["r"] * kdf["n"] <= MAX_MEMORY):  # no file makes us churn
            raise ValueError
        salt, nonce = base64.b64decode(header["salt"]), base64.b64decode(header["nonce"])
        data = base64.b64decode(whole["data"])
    except (ValueError, KeyError, TypeError, AttributeError):
        raise BackupError("This isn't an HPC Hub backup file") from None
    aad = json.dumps(header, sort_keys=True).encode()
    try:
        plain = AESGCM(_key(password, salt, kdf)).decrypt(nonce, data, aad)
    except InvalidTag:
        raise WrongPassword("That password doesn't open this backup") from None
    contents = json.loads(plain)
    if not isinstance(contents, dict):
        raise BackupError("This backup is damaged")
    return contents


# -- what goes in, and back -------------------------------------------------------------------------------

def _settings_files() -> dict[str, str]:
    out = {}
    if CONFIG_DIR.is_dir():
        for p in sorted(CONFIG_DIR.iterdir()):
            if p.is_file() and p.suffix in FILE_TYPES:
                try:
                    out[p.name] = p.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    pass
    return out


def _logins(cluster_ids: list[str]) -> list[dict]:
    from ..globus.api import KEY as GLOBUS
    found = []
    for cluster, kind in [*((c, k) for c in cluster_ids for k in (credentials.SSH, credentials.VPN)), GLOBUS]:
        try:
            login = credentials.load(cluster, kind)
        except Exception:  # noqa: BLE001  a keyring that can't answer: that login stays out
            login = None
        if login and (login.username or login.password):
            found.append({"cluster": cluster, "kind": kind, "username": login.username, "password": login.password})
    return found


def gather(cluster_ids: list[str], version: str) -> dict:
    return {"made": int(time.time()), "version": version, "files": _settings_files(),
            "logins": _logins(cluster_ids)}


def summary(contents: dict) -> dict:
    """What a backup holds, as the import asks about it (no passwords)."""
    files = contents.get("files") or {}
    clusters = []
    try:
        import tomllib
        table = tomllib.loads(files.get("clusters.toml", "")).get("clusters", {})
        clusters = [(v.get("name") or k) for k, v in table.items() if isinstance(v, dict)]
    except (ValueError, ImportError, AttributeError):
        pass
    logins = contents.get("logins") or []
    return {"made": contents.get("made"), "version": contents.get("version", ""), "files": sorted(files),
            "clusters": [c for c in clusters if c],
            "logins": sorted({f"{x['cluster']} ({x['kind'].upper()})" for x in logins if x.get("cluster") != "globus"}),
            "globus": any(x.get("cluster") == "globus" for x in logins)}


def write(folder: str, contents: dict, password: str) -> Path:
    """Seal and save in folder as hpc-hub-backup-<date>.hpchub (only you may read it). Returns its path."""
    where = Path(folder).expanduser()
    if not where.is_dir():
        raise BackupError(f"{where} isn't a folder")
    path = where / f"hpc-hub-backup-{time.strftime('%Y-%m-%d')}{SUFFIX}"
    n = 2
    while path.exists():
        path = where / f"hpc-hub-backup-{time.strftime('%Y-%m-%d')}-{n}{SUFFIX}"
        n += 1
    blob = seal(contents, password)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(blob)
    return path


def read(path: str, password: str) -> dict:
    p = Path(path).expanduser()
    try:
        if p.stat().st_size > MAX_FILE:
            raise BackupError("This file is too big to be an HPC Hub backup")
        blob = p.read_bytes()
    except OSError as e:
        raise BackupError(f"Can't read {p}: {e.strerror or e}") from None
    return unseal(blob, password)


def restore(contents: dict) -> dict:
    """Put the backup's settings and logins in place. The settings there now are moved aside first, to
    ~/.config/hpc-hub/before-import-<time>/, so nothing is lost. Returns how many of each came back."""
    files = contents.get("files") or {}
    names = [n for n in files if isinstance(n, str) and n == Path(n).name and Path(n).suffix in FILE_TYPES
             and not n.startswith(".")]
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    aside = CONFIG_DIR / f"before-import-{time.strftime('%Y%m%d-%H%M%S')}"
    for name in names:
        if (CONFIG_DIR / name).exists():
            aside.mkdir(exist_ok=True)
            shutil.copy2(CONFIG_DIR / name, aside / name)
    for name in names:
        tmp = CONFIG_DIR / f".{name}.import"
        tmp.write_text(str(files[name]), encoding="utf-8")
        os.replace(tmp, CONFIG_DIR / name)
    saved = 0
    for x in contents.get("logins") or []:
        if not (isinstance(x, dict) and x.get("cluster") and x.get("kind")):
            continue
        credentials.save(str(x["cluster"]), str(x["kind"]),
                         credentials.Login(str(x.get("username", "")), str(x.get("password", ""))))
        saved += 1
    return {"files": len(names), "logins": saved, "aside": str(aside) if aside.exists() else ""}
