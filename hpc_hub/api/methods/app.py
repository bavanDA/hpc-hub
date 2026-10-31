"""What the UI can call. Each method takes keyword params and returns plain JSON data."""

from dataclasses import asdict

from ... import __version__
from ..server import method


@method("app.version")
def version() -> dict:
    return {"version": __version__}


@method("clusters.list")
def clusters() -> list[dict]:
    """The clusters you use (setup.choose) and their settings (no secrets live there)."""
    from ..hub import hub
    return [asdict(c) for c in hub().clusters]


@method("app.status")
def status() -> dict:
    """blocked: another HPC Hub (the GTK app) is open, so this one leaves the clusters alone."""
    from ...core import single
    from ..hub import hub
    return {"blocked": hub().blocked, "message": single.MESSAGE if hub().blocked else ""}
