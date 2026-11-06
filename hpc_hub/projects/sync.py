"""One cluster's projects shared by every HPC Hub you use, in ~/.hpc-hub/projects.json there: the newer change
wins, a removal stays, and opened keeps the latest."""

import time
from dataclasses import asdict

from .store import Project

FOLDER = ".hpc-hub"
FILE = f"{FOLDER}/projects.json"
KEEP_REMOVED = 180 * 86400  # how long a removal is remembered
FIELDS = ("name", "path", "main_tex", "kind", "opened", "copy_to", "copy_into", "updated")


def _project(cluster: str, row) -> Project | None:
    if not isinstance(row, dict) or not isinstance(row.get("name"), str) or not isinstance(row.get("path"), str):
        return None
    if not row["name"] or not row["path"]:
        return None
    kw = {k: row[k] for k in FIELDS if k in row and isinstance(row[k], type(getattr(Project("", "", ""), k)))}
    return Project(**{**kw, "cluster": cluster})


def merge(cluster: str, mine: list[Project], removed: dict[str, int], shared: dict) -> tuple[list[Project],
                                                                                              dict[str, int]]:
    """mine: this side's projects on cluster; removed: path -> when, this side's. shared: the file's contents."""
    gone = dict(removed)
    for path, when in (shared.get("removed") or {}).items():
        if isinstance(path, str) and isinstance(when, (int, float)):
            gone[path] = max(gone.get(path, 0), int(when))
    by_path = {p.path: Project(**asdict(p)) for p in mine}
    for row in shared.get("projects") or []:
        theirs = _project(cluster, row)
        if not theirs:
            continue
        ours = by_path.get(theirs.path)
        if ours is None or theirs.updated > ours.updated:
            if ours:
                theirs.opened = max(theirs.opened, ours.opened)
            by_path[theirs.path] = theirs
        else:
            ours.opened = max(ours.opened, theirs.opened)
    old = time.time() - KEEP_REMOVED
    gone = {k: v for k, v in gone.items() if v > old}
    return [p for p in by_path.values() if gone.get(p.path, -1) < p.updated], gone


def shared_json(projects: list[Project], removed: dict[str, int]) -> dict:
    rows = [{k: getattr(p, k) for k in FIELDS} for p in sorted(projects, key=lambda p: p.path)]
    return {"version": 1, "projects": rows, "removed": dict(sorted(removed.items()))}
