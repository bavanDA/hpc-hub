"""What the UI can call. Each method takes keyword params and returns plain JSON data."""

from dataclasses import asdict

from ... import __version__
from ...core import config
from ..server import method


@method("app.version")
def version() -> dict:
    return {"version": __version__}


@method("clusters.list")
def clusters() -> list[dict]:
    """Your clusters and their settings (no secrets live there)."""
    return [asdict(c) for c in config.load()]
