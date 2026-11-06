"""Choosing a project's folder on a cluster."""

import posixpath

from ...files import remote_fs
from ..hub import hub
from ..server import method
from .projects import _home

_places: dict[str, list[remote_fs.Place]] = {}  # per cluster, found once a run


@method("projects.places")
def places(cluster: str) -> dict:
    """Where people keep work on the cluster, and Home, Project and Scratch out of it (Home as ~)."""
    s = hub().connected(cluster)
    if cluster not in _places:
        _places[cluster] = remote_fs.places(s.ssh)
    found = _places[cluster]
    return {"home": _home(cluster), "places": [{"label": p.label, "path": p.path} for p in found],
            "storage": [{"label": p.label, "path": "~" if p.label == "Home" else p.path}
                        for p in remote_fs.storage(found)]}


@method("projects.browse")
def browse(cluster: str, path: str = "~") -> dict:
    """The folders inside path, links to folders included."""
    s = hub().connected(cluster)
    home = _home(cluster)
    target = home + path[1:] if path.startswith("~") else path
    target = posixpath.normpath(target) if target else home
    folders = [e.name for e in remote_fs.list_dir(s.ssh, target) if e.is_dir]
    return {"path": target, "home": home, "folders": folders}


@method("projects.mkdir")
def mkdir(cluster: str, path: str) -> None:
    remote_fs.mkdir(hub().connected(cluster).ssh, path)
