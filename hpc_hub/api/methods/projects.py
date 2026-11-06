"""The project list: add, create, edit and remove projects, shared with your other devices through each cluster
(projects/sync.py)."""

import json
import posixpath
import re
import threading
import time

from ...core import config
from ...files import remote_fs
from ...projects import papers, store, templates
from ...projects import sync as shared
from ...projects.store import Project
from ..hub import CONNECTED, hub
from ..server import method

SYNC_EVERY = 60

_lock = threading.Lock()
_homes: dict[str, str] = {}
_synced: dict[str, float] = {}  # cluster -> when it was last merged with its shared file


def _load() -> list[Project]:
    return store.load(store.PROJECTS_FILE)


def _save(items: list[Project]) -> None:
    store.save(items, store.PROJECTS_FILE)
    for c in {p.cluster for p in items} | set(_synced):
        sync_soon(c)


def _id(p: Project) -> str:
    return f"{p.cluster}:{p.path}"


def _find(items: list[Project], id: str) -> Project:
    """By id (cluster:path), or by name when only one project has it."""
    found = [p for p in items if _id(p) == id] or [p for p in items if p.name == id]
    if len(found) != 1:
        raise ValueError(f"No project {id}" if not found else f"More than one project is called {id}")
    return found[0]


def _home(cluster: str) -> str:
    if cluster not in _homes:
        _homes[cluster] = remote_fs.home(hub().connected(cluster).ssh)
    return _homes[cluster]


def _json(p: Project) -> dict:
    s = hub().sessions.get(p.cluster)
    user = getattr(getattr(s, "ssh", None), "username", "") or ""
    return {"id": _id(p), "name": p.name, "cluster": p.cluster, "cluster_name": s.cfg.name if s else "",
            "path": p.path, "group": store.group_of(p.path, user),
            "main_tex": p.main_tex, "kind": p.kind, "latex": p.is_latex, "opened": p.opened,
            "copy_to": p.copy_to, "copy_into": p.copy_into}


def sync_soon(cluster: str) -> None:
    threading.Thread(target=_sync_quietly, args=(cluster,), daemon=True).start()


def _sync_quietly(cluster: str) -> None:
    try:
        sync(cluster)
    except Exception as e:  # noqa: BLE001 - an unreachable cluster just waits for the next time
        s = hub().sessions.get(cluster)
        if s:
            s._log(f"Projects not shared: {e}")


def _read_shared(ssh, path: str) -> dict:
    res = ssh.run(f"cat {remote_fs.q(path)} 2>/dev/null || test ! -e {remote_fs.q(path)}", timeout=30)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "could not read the shared list")
    try:
        data = json.loads(res.stdout) if res.stdout.strip() else {}
    except ValueError:
        data = {}
    return data if isinstance(data, dict) else {}


def sync(cluster: str) -> bool:
    """Merge this cluster's projects with its shared file and write both back. True when ours changed."""
    s = hub().sessions.get(cluster)
    if not s or not s.connected:
        return False
    home = _home(cluster)
    path = f"{home}/{shared.FILE}"
    theirs = _read_shared(s.ssh, path)
    prefix = f"{cluster}:"
    with _lock:
        items = _load()
        for p in items:  # one name for a folder on both sides
            if p.cluster == cluster and p.path.startswith("~"):
                p.path = home + p.path[1:]
        mine = [p for p in items if p.cluster == cluster]
        removed = store.load_removed()
        ours_gone = {k[len(prefix):]: v for k, v in removed.items() if k.startswith(prefix)}
        merged, gone = shared.merge(cluster, mine, ours_gone, theirs)
        changed = sorted(merged, key=_id) != sorted(mine, key=_id)
        if changed:
            store.save([p for p in items if p.cluster != cluster] + merged, store.PROJECTS_FILE, stamp=False)
        store.save_removed({**{k: v for k, v in removed.items() if not k.startswith(prefix)},
                            **{prefix + k: v for k, v in gone.items()}})
        out = shared.shared_json(merged, gone)
    if out != theirs:
        remote_fs.mkdir(s.ssh, f"{home}/{shared.FOLDER}")
        remote_fs.write_bytes(s.ssh, path, json.dumps(out, indent=1).encode())
    _synced[cluster] = time.time()
    if changed:
        hub().emit("projects", {"cluster": cluster})
    return changed


@method("projects.list")
def list_projects() -> dict:
    """Most recently opened first. LaTeX papers are left out while the Papers page is on."""
    papers_page = config.load_app(config.APP_FILE).experimental_papers
    for s in hub().sessions.values():
        if s.connected and time.time() - _synced.get(s.cfg.id, 0) > SYNC_EVERY:
            _synced[s.cfg.id] = time.time()
            sync_soon(s.cfg.id)
    items = sorted(_load(), key=lambda p: (-p.opened, p.name.lower()))
    return {"experimental": papers_page,
            "clusters": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected}
                         for s in hub().sessions.values()],
            "projects": [_json(p) for p in items if not (p.is_latex and papers_page)]}


def slug(name: str) -> str:
    return re.sub(r"[^\w.-]+", "-", name.strip()).strip("-") or "project"


def _checked(cluster: str, name: str, path: str) -> Project:
    """With its path expanded and its main .tex found; unchecked while the cluster is not connected."""
    s = hub().session(cluster)
    if not s.connected:
        return Project(name, cluster, path)
    target = remote_fs.expand(s.ssh, path)
    if s.ssh.run(f"test -d {remote_fs.q(target)}", timeout=30).returncode != 0:
        raise RuntimeError(f"No folder {target} on {s.cfg.name}")
    mains = papers.find_main_tex(s.ssh, target)
    latex = bool(mains) and "/" not in mains[0]
    return Project(name, cluster, target, main_tex=mains[0] if mains else "", kind="latex" if latex else "code")


def _valid(name: str, path: str) -> tuple[str, str]:
    name, path = name.strip(), path.strip()
    if not name:
        raise ValueError("Give the project a name")
    if not path:
        raise ValueError("Choose a folder")
    return name, path


def _add(p: Project) -> dict:
    with _lock:
        items = _load()
        if any(_id(x) == _id(p) for x in items):
            raise ValueError(f"{p.path} is already in your projects")
        items.append(p)
        _save(items)
    return _json(p)


@method("projects.add")
def add(name: str, cluster: str, path: str) -> dict:
    """A folder that is already on a cluster."""
    name, path = _valid(name, path)
    return _add(_checked(cluster, name, path))


@method("projects.update")
def update(id: str, name: str, cluster: str, path: str) -> dict:
    name, path = _valid(name, path)
    fresh = _checked(cluster, name, path)
    with _lock:
        items = _load()
        p = _find(items, id)
        if _id(fresh) != _id(p) and any(_id(x) == _id(fresh) for x in items):
            raise ValueError(f"{fresh.path} is already in your projects")
        same = _id(fresh) == _id(p)
        p.main_tex = fresh.main_tex or (p.main_tex if same else "")
        p.kind = fresh.kind or (p.kind if same else "")
        p.name, p.cluster, p.path = fresh.name, fresh.cluster, fresh.path
        _save(items)
    return _json(p)


@method("projects.remove")
def remove(id: str) -> None:
    """Only from the list: the folder on the cluster stays."""
    with _lock:
        items = _load()
        items.remove(_find(items, id))
        _save(items)


@method("projects.opened")
def opened(id: str) -> dict:
    """Mark it opened now, with ~ expanded once the cluster is connected."""
    with _lock:
        items = _load()
        p = _find(items, id)
        s = hub().session(p.cluster)
        if p.path.startswith("~") and s.connected:
            p.path = remote_fs.expand(s.ssh, p.path)
        p.opened = int(time.time())
        _save(items)
    return _json(p)


@method("projects.create")
def create(cluster: str, parent: str, name: str, template: str = "Empty", git: bool = True) -> dict:
    """A new folder from a template inside parent, added to the list."""
    name = name.strip()
    if not name:
        raise ValueError("Give the project a name")
    if template not in templates.TEMPLATES:
        raise ValueError(f"No template {template}")
    s = hub().session(cluster)
    if not s.connected:
        raise RuntimeError(f"Connect to {s.cfg.name} first to create the folder")
    target = posixpath.join(remote_fs.expand(s.ssh, parent.strip() or "~"), slug(name))
    res = s.ssh.run(templates.create_command(target, template, name, git), timeout=60)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Could not create the folder (does it exist already?)")
    mains = papers.find_main_tex(s.ssh, target)
    return _add(Project(name, cluster, target, main_tex=mains[0] if mains else "",
                        kind="latex" if template == "LaTeX paper" else "code"))


CONNECTED.append(_sync_quietly)
