"""The app's version, its clusters and whether another HPC Hub holds the lock."""

from dataclasses import asdict

from ... import __version__
from ...clusters import site
from ...core.config import ClusterConfig
from ..server import method


def cluster_json(c: ClusterConfig) -> dict:
    """A cluster as the app gets it: its settings, and what it does its own way (hpc_hub/clusters), so the app
    never names a cluster."""
    s = site(c.id)
    return {**asdict(c), "help_email": s.help_email, "code_sign_in": s.code_sign_in}


@method("app.version")
def version() -> dict:
    return {"version": __version__}


@method("clusters.list")
def clusters() -> list[dict]:
    """The clusters you use (setup.choose) and their settings (no secrets live there)."""
    from ..hub import hub
    return [cluster_json(c) for c in hub().clusters]


@method("app.status")
def status() -> dict:
    """blocked: another HPC Hub is open, so this one leaves the clusters alone."""
    from ...core import single
    from ..hub import hub
    return {"blocked": hub().blocked, "message": single.MESSAGE if hub().blocked else ""}
