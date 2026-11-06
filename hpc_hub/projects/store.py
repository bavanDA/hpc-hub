"""The project list in projects.toml: a named folder on a cluster each."""

import json
import time
import tomllib
from dataclasses import asdict, dataclass, fields
from pathlib import Path

from ..core.config import CONFIG_DIR
from ..core.toml_file import toml_value

PROJECTS_FILE = CONFIG_DIR / "projects.toml"
REMOVED = "projects-removed.json"  # next to the projects: cluster:path -> when, so a sync doesn't bring it back


@dataclass
class Project:
    name: str
    cluster: str  # cluster id
    path: str  # absolute folder on the cluster
    main_tex: str = ""  # relative to path
    opened: int = 0  # last opened, unix time
    kind: str = ""  # "code" or "latex"; empty in old files
    copy_to: str = ""  # cluster id it was last copied or synced to
    copy_into: str = ""  # folder there it went into
    updated: int = 0  # last added or changed, unix time: the newer one wins a sync (projects/sync.py)

    @property
    def is_latex(self) -> bool:
        """Old entries without a kind: a main .tex at the top."""
        return self.kind == "latex" or not self.kind and bool(self.main_tex) and "/" not in self.main_tex


GROUP_TREES = ("project", "projects", "scratch")  # /scratch/<group>/<you>, /expanse/lustre/projects/<group>/<you>
GROUP_LINKS = ("project_", "palmer_scratch_", "scratch_")  # Yale's links in home: ~/project_pi_abc


def group_of(path: str, user: str = "") -> str:
    """The group a project's folder belongs to: the folder above yours in a shared tree; "" in your own space."""
    parts = [x for x in path.split("/") if x]
    for i, seg in enumerate(parts):
        for link in GROUP_LINKS:
            if seg.startswith(link) and len(seg) > len(link):
                return seg[len(link):]
        if seg in GROUP_TREES and i + 2 < len(parts):
            group, below = parts[i + 1], parts[i + 2]
            if group != user and (not user or below == user):
                return group
    return ""


def load(path: Path = PROJECTS_FILE) -> list[Project]:
    if not path.exists():
        return []
    with open(path, "rb") as fh:
        rows = tomllib.load(fh).get("projects", [])
    names = {f.name for f in fields(Project)}
    out = []
    for r in rows:
        if isinstance(r, dict) and r.get("name") and r.get("cluster") and r.get("path"):
            out.append(Project(**{k: v for k, v in r.items() if k in names}))
    return out


SAME = ("name", "cluster", "path", "main_tex", "kind", "copy_to", "copy_into")


def save(projects: list[Project], path: Path = PROJECTS_FILE, stamp: bool = True) -> None:
    """stamp: mark what changed since the last save as changed now, and what went as removed now."""
    if stamp:
        _stamp(projects, path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# HPC Hub projects", ""]
    for p in projects:
        lines.append("[[projects]]")
        lines += [f"{k} = {toml_value(v)}" for k, v in asdict(p).items()]
        lines.append("")
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines), encoding="utf-8")
    tmp.replace(path)


def _key(p: Project) -> str:
    return f"{p.cluster}:{p.path}"


def _stamp(projects: list[Project], path: Path) -> None:
    now = int(time.time())
    before = {_key(p): p for p in load(path)}
    for p in projects:
        old = before.pop(_key(p), None)
        if not old or any(getattr(p, k) != getattr(old, k) for k in SAME):
            p.updated = max(now, p.updated)
    if before:
        removed = load_removed(path.parent / REMOVED)
        removed.update({k: max(now, p.updated) for k, p in before.items()})  # a clock ahead elsewhere
        save_removed(removed, path.parent / REMOVED)


def load_removed(path: Path | None = None) -> dict[str, int]:
    path = path or PROJECTS_FILE.parent / REMOVED
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return {k: int(v) for k, v in data.items() if isinstance(v, (int, float))} if isinstance(data, dict) else {}


def save_removed(removed: dict[str, int], path: Path | None = None) -> None:
    path = path or PROJECTS_FILE.parent / REMOVED
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(removed, indent=1))
    tmp.replace(path)
