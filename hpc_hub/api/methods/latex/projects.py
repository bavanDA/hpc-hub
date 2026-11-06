import posixpath
import re
import shlex
import threading
import time

from ....files import remote_fs
from ....projects import papers as tex_papers
from ....projects import store
from ....projects.store import Project
from ...hub import hub
from ...server import method
from .build import settings
from .files import inside, tree

_lock = threading.Lock()


def short(folder: str) -> str:
    """/mmfs1/scratch/mygroup/jdoe/thesis/paper -> scratch/thesis/paper; home becomes ~."""
    m = re.match(r"^(?:/mmfs1)?/(scratch|project)/[^/]+/[^/]+(/.*)?$", folder)
    if m:
        return m.group(1) + (m.group(2) or "")
    return re.sub(r"^(?:/mmfs1)?/home/[^/]+", "~", folder)


def _cluster_name(cluster: str) -> str:
    s = hub().sessions.get(cluster)
    return s.cfg.name if s else cluster


def _project_json(p: Project) -> dict:
    return {"id": f"{p.cluster}:{p.path}", "name": p.name, "cluster": p.cluster,
            "cluster_name": _cluster_name(p.cluster), "path": p.path, "main_tex": p.main_tex, "opened": p.opened}


def _paper_json(cluster: str, p: tex_papers.Paper) -> dict:
    parent, name = posixpath.split(p.folder)
    return {"cluster": cluster, "cluster_name": _cluster_name(cluster), "folder": p.folder, "main": p.main,
            "mtime": p.mtime, "others": p.others, "short": short(p.folder),
            "title": f"{posixpath.basename(parent)} / {name}" if parent and parent != "/" else name}


def _same_folder(p: Project, cluster: str, folder: str) -> bool:
    return p.cluster == cluster and p.path.rstrip("/") == folder.rstrip("/")


@method("latex.picker")
def picker() -> dict:
    sessions = hub().sessions
    items = sorted(store.load(store.PROJECTS_FILE), key=lambda p: (-p.opened, p.name.lower()))
    papers, found_at = [], {}
    for cid in sessions:
        found, at = tex_papers.load_papers(cid)
        if at:
            found_at[cid] = at
            papers += [_paper_json(cid, p) for p in found]
    papers.sort(key=lambda p: -p["mtime"])
    return {"clusters": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected} for s in sessions.values()],
            "projects": [_project_json(p) for p in items if p.is_latex and p.cluster in sessions],
            "papers": papers[:60], "found_at": found_at}


@method("latex.scan")
def scan(cluster: str) -> list[dict]:
    found = tex_papers.find_papers(hub().connected(cluster).ssh)
    tex_papers.save_papers(cluster, found)
    return [_paper_json(cluster, p) for p in found]


@method("latex.forget")
def forget(cluster: str, path: str) -> None:
    with _lock:
        items = store.load(store.PROJECTS_FILE)
        store.save([p for p in items if not _same_folder(p, cluster, path)], store.PROJECTS_FILE)


def _remember(cluster: str, folder: str, main_rel: str) -> Project:
    with _lock:
        items = store.load(store.PROJECTS_FILE)
        p = next((x for x in items if _same_folder(x, cluster, folder)), None)
        if not p:
            p = Project(posixpath.basename(folder) or folder, cluster, folder, kind="latex")
            items.append(p)
        p.main_tex, p.opened = main_rel, int(time.time())
        p.kind = p.kind or "latex"
        store.save(items, store.PROJECTS_FILE)
        return p


def _main_of(ssh, cluster: str, folder: str, main: str) -> str | list[str]:
    """The folder's main .tex (relative): asked for, remembered, or the only one found; else all found."""
    known = next((p for p in store.load(store.PROJECTS_FILE) if _same_folder(p, cluster, folder) and p.main_tex),
                 None)
    if main or known:
        return main or known.main_tex
    found = tex_papers.find_main_tex(ssh, folder)
    if not found:
        raise FileNotFoundError(f"No .tex file with \\documentclass in {folder}")
    return found[0] if len(found) == 1 else found


@method("latex.open")
def open_project(cluster: str, path: str, main: str = "") -> dict:
    """A .tex file, or a folder: then {choices, folder} when it has several main files."""
    ssh = hub().connected(cluster).ssh
    path = remote_fs.expand(ssh, path.strip())
    if not path:
        raise ValueError("Give a path")
    if path.endswith(".tex"):
        folder, rel = posixpath.dirname(path), posixpath.basename(path)
        if ssh.run(f"test -f {shlex.quote(path)}", timeout=30).returncode != 0:
            raise FileNotFoundError(f"No file {path}")
    else:
        folder = path.rstrip("/") or "/"
        rel = _main_of(ssh, cluster, folder, main)
        if isinstance(rel, list):
            return {"choices": rel, "folder": folder}
    p = _remember(cluster, folder, rel)
    return {"cluster": cluster, "cluster_name": hub().session(cluster).cfg.name, "name": p.name, "folder": folder,
            "main": posixpath.join(folder, rel), "tree": tree(cluster, folder), "settings": settings(cluster)}


@method("latex.set_main")
def set_main(cluster: str, folder: str, main: str) -> None:
    _remember(cluster, folder, posixpath.relpath(inside(folder, main), folder))
