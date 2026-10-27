"""Logins stored in the system keyring. Nothing touches disk in plain text.

With GTK: GNOME Keyring through libsecret. Without it (the Tauri app's frozen backend): the same Secret Service
entries through secretstorage on Linux, Keychain or Credential Manager through keyring elsewhere.
Android has no keyring the backend can reach: a file encrypted with a key the phone's key store keeps
(vault_file.py)."""

import json
import sys
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


def _attrs(cluster_id: str, kind: str) -> dict:
    return {"cluster": cluster_id, "kind": kind}


def save(cluster_id: str, kind: str, login: Login) -> None:
    secret = json.dumps({"username": login.username, "password": login.password})
    _store(_attrs(cluster_id, kind), f"HPC Hub {kind.upper()} login ({cluster_id})", secret)


def load(cluster_id: str, kind: str) -> Login | None:
    secret = _lookup(_attrs(cluster_id, kind))
    if not secret:
        return None
    try:
        data = json.loads(secret)
        return Login(data.get("username", ""), data.get("password", ""))
    except (ValueError, AttributeError):
        return None


def clear(cluster_id: str, kind: str) -> None:
    _clear(_attrs(cluster_id, kind))


# -- backends ----------------------------------------------------------------------------
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
