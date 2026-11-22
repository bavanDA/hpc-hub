"""Logins in the system keyring: libsecret when PyGObject is there, else secretstorage on Linux, Keychain or
Credential Manager elsewhere, and the encrypted vault file on Android.

A login found is kept in memory for the backend's lifetime, so the keyring (a new D-Bus connection each time on
Linux) is asked once per login. Saving or clearing one changes what is kept. Nothing found is not kept: a locked
keyring or a dismissed unlock looks the same as no login, so the next load asks again."""

import json
import sys
import threading
from contextlib import closing
from dataclasses import dataclass

try:
    import gi

    gi.require_version("Secret", "1")
    from gi.repository import Secret
except (ImportError, ValueError, AttributeError):  # AttributeError: a stray gi folder without PyGObject
    Secret = None

SCHEMA_NAME = "local.hpchub.Login"
SERVICE = "HPC Hub"  # keyring's service on macOS and Windows

SCHEMA = Secret.Schema.new(
    SCHEMA_NAME,
    Secret.SchemaFlags.NONE,
    {
        "cluster": Secret.SchemaAttributeType.STRING,
        "kind": Secret.SchemaAttributeType.STRING,
    },
) if Secret else None

SSH = "ssh"
VPN = "vpn"


@dataclass
class Login:
    username: str
    password: str


def cluster_username(host: str, typed: str) -> str:
    """The username as the cluster knows it. A campus email for this host's domain becomes its user part, so
    "ab123@example.edu" logs in to login.example.edu as ab123. Anything else stays as typed."""
    name = typed.strip()
    user, at, domain = name.rpartition("@")
    domain, host = domain.lower(), host.strip().lower()
    if at and user and domain and (host == domain or host.endswith("." + domain)):
        return user.lower()
    return name


def _attrs(cluster_id: str, kind: str) -> dict:
    return {"cluster": cluster_id, "kind": kind}


_cache: dict[tuple, str] = {}  # the secrets found, by their attrs: in memory only, never written anywhere
_cache_lock = threading.Lock()
_changes = 0  # counts saves and clears: a lookup that ran while one happened may be old, so it isn't kept


def _key(attrs: dict) -> tuple:
    return tuple(sorted(attrs.items()))


def _forget(attrs: dict) -> None:
    """Drop what is kept for these attrs; fewer attrs ({"cluster": ...}) drop every login they match."""
    global _changes
    with _cache_lock:
        _changes += 1
        for key in [k for k in _cache if set(attrs.items()) <= set(k)]:
            del _cache[key]


def _cached_lookup(attrs: dict) -> str | None:
    key = _key(attrs)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
        before = _changes
    secret = _lookup(attrs)
    if secret:  # only a login found: nothing found may be a locked keyring, so that is asked again next time
        with _cache_lock:
            if _changes == before:
                _cache[key] = secret
    return secret


def save(cluster_id: str, kind: str, login: Login) -> None:
    global _changes
    secret = json.dumps({"username": login.username, "password": login.password})
    attrs = _attrs(cluster_id, kind)
    _forget(attrs)  # a store that fails leaves nothing kept: the next load asks the keyring what it has
    _store(attrs, f"HPC Hub {kind.upper()} login ({cluster_id})", secret)
    with _cache_lock:
        _changes += 1
        _cache[_key(attrs)] = secret


def load(cluster_id: str, kind: str) -> Login | None:
    secret = _cached_lookup(_attrs(cluster_id, kind))
    if not secret:
        return None
    try:
        data = json.loads(secret)
        return Login(data.get("username", ""), data.get("password", ""))
    except (ValueError, AttributeError):
        return None


def clear(cluster_id: str, kind: str) -> None:
    attrs = _attrs(cluster_id, kind)
    try:
        _clear(attrs)
    finally:
        _forget(attrs)  # even when the clear failed: the keyring is asked again


def _vault():
    """macOS Keychain or Windows Credential Manager, picked by name: left to itself, keyring may fall back to a
    weak store (a plain file) on a system without a vault, and other people's passwords must never land there."""
    if sys.platform == "darwin":
        from keyring.backends.macOS import Keyring
    elif sys.platform == "win32":
        from keyring.backends.Windows import WinVaultKeyring as Keyring
    elif sys.platform == "android":
        from .vault_file import FileVault as Keyring
    else:
        raise RuntimeError("No safe place to keep passwords here. Install GNOME Keyring or KWallet")
    return Keyring()


def _secret_service() -> bool:
    return Secret is None and sys.platform.startswith("linux")


def _account(attrs: dict) -> str:
    return f"{attrs['cluster']}/{attrs['kind']}"


def _store(attrs: dict, label: str, secret: str) -> None:
    if Secret:
        Secret.password_store_sync(SCHEMA, attrs, Secret.COLLECTION_DEFAULT, label, secret, None)
    elif _secret_service():
        import secretstorage

        with closing(secretstorage.dbus_init()) as conn:
            collection = secretstorage.get_default_collection(conn)
            if collection.is_locked():
                collection.unlock()
            # libsecret keeps the schema name in xdg:schema, so both apps find the same entry
            collection.create_item(label, {"xdg:schema": SCHEMA_NAME, **attrs}, secret.encode(), replace=True)
    else:
        _vault().set_password(SERVICE, _account(attrs), secret)


def _lookup(attrs: dict) -> str | None:
    if Secret:
        return Secret.password_lookup_sync(SCHEMA, attrs, None)
    if _secret_service():
        import secretstorage

        with closing(secretstorage.dbus_init()) as conn:
            for item in secretstorage.search_items(conn, {"xdg:schema": SCHEMA_NAME, **attrs}):
                if item.is_locked():
                    item.unlock()
                return item.get_secret().decode()
        return None
    return _vault().get_password(SERVICE, _account(attrs))


def _clear(attrs: dict) -> None:
    if Secret:
        Secret.password_clear_sync(SCHEMA, attrs, None)
    elif _secret_service():
        import secretstorage

        with closing(secretstorage.dbus_init()) as conn:
            for item in secretstorage.search_items(conn, {"xdg:schema": SCHEMA_NAME, **attrs}):
                item.delete()
    elif sys.platform == "android":
        _vault().delete_password(SERVICE, _account(attrs))
    else:
        from keyring.errors import PasswordDeleteError

        try:
            _vault().delete_password(SERVICE, _account(attrs))
        except PasswordDeleteError:
            pass  # nothing saved
