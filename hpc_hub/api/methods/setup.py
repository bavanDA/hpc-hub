"""Which clusters you use: asked on the first start, changed later in Settings."""

from ...core import config
from ..hub import hub
from ..server import method


@method("setup.status")
def status() -> dict:
    app = config.load_app()
    return {"first_run": config.first_run(app), "chosen": [c.id for c in hub().clusters],
            "choices": [{"id": c.id, "name": c.name, "short": c.short_name, "org": c.who, "host": c.host,
                         "vpn": c.vpn.enabled, "second_factor": c.second_factor} for c in config.default_clusters()]}


@method("setup.choose")
def choose(ids: list[str]) -> dict:
    """Use these clusters (in the order given). At least one."""
    known = [c.id for c in config.default_clusters()]
    ids = [i for i in dict.fromkeys(ids) if i in known]
    if not ids:
        raise ValueError("Pick at least one cluster")
    hub().use_clusters(ids)
    app = config.load_app()
    app.clusters = ",".join(ids)
    config.save_app(app)
    return status()
