"""Logins stored in GNOME Keyring (Secret Service). Nothing touches disk in plain text."""

import json
from dataclasses import dataclass

import gi

gi.require_version("Secret", "1")
from gi.repository import Secret  # noqa: E402

SCHEMA = Secret.Schema.new(
    "local.hpchub.Login",
    Secret.SchemaFlags.NONE,
    {
        "cluster": Secret.SchemaAttributeType.STRING,
        "kind": Secret.SchemaAttributeType.STRING,
    },
)

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
    Secret.password_store_sync(
        SCHEMA,
        _attrs(cluster_id, kind),
        Secret.COLLECTION_DEFAULT,
        f"HPC Hub {kind.upper()} login ({cluster_id})",
        secret,
        None,
    )


def load(cluster_id: str, kind: str) -> Login | None:
    secret = Secret.password_lookup_sync(SCHEMA, _attrs(cluster_id, kind), None)
    if not secret:
        return None
    try:
        data = json.loads(secret)
        return Login(data.get("username", ""), data.get("password", ""))
    except (ValueError, AttributeError):
        return None


def clear(cluster_id: str, kind: str) -> None:
    Secret.password_clear_sync(SCHEMA, _attrs(cluster_id, kind), None)
