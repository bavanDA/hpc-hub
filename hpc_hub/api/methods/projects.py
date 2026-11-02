"""Projects: named folders on the clusters. Add, create, edit and remove them, choose a folder, and copy or sync one
with its Claude chats to another cluster, through this laptop or with Globus. Copies report `transfer` events."""

import posixpath
import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from ...agents import chat_copy
from ...agents import chats as chat_list
from ...core import config, features
from ...files import remote_fs, transfer
from ...globus import api as globus
from ...projects import store
from ...projects.store import Project
from ..hub import hub
from ..server import method

GLOBUS_POLL = 3
GLOBUS_TRIES = 20  # Globus errors in a row before we stop asking
CHAT_LIMIT = 400

_lock = threading.Lock()
_places: dict[str, list[remote_fs.Place]] = {}  # per cluster, found once per run
_homes: dict[str, str] = {}
_running: dict[str, transfer.Progress] = {}  # copies still going, by transfer id


# -- the list ------------------------------------------------------------------------------
def _load() -> list[Project]:
    return store.load(store.PROJECTS_FILE)


def _save(items: list[Project]) -> None:
    store.save(items, store.PROJECTS_FILE)


def _id(p: Project) -> str:
    return f"{p.cluster}:{p.path}"


def _find(items: list[Project], id: str) -> Project:
    """By id (cluster:path), or by name when only one project has it."""
    found = [p for p in items if _id(p) == id] or [p for p in items if p.name == id]
    if len(found) != 1:
        raise ValueError(f"No project {id}" if not found else f"More than one project is called {id}")
    return found[0]


def _app() -> config.AppSettings:
    return config.load_app(config.APP_FILE)


def _experimental() -> bool:
    return features.experimental or _app().experimental


def _json(p: Project) -> dict:
    s = hub().sessions.get(p.cluster)
    return {"id": _id(p), "name": p.name, "cluster": p.cluster, "cluster_name": s.cfg.name if s else "",
            "path": p.path, "main_tex": p.main_tex, "kind": p.kind, "latex": p.is_latex, "opened": p.opened,
            "copy_to": p.copy_to, "copy_into": p.copy_into}


@method("projects.list")
def list_projects() -> dict:
    """Your projects, most recently opened first. LaTeX papers live on the LaTeX page while experimental is on."""
    exp = _experimental()
    items = sorted(_load(), key=lambda p: (-p.opened, p.name.lower()))
    return {"experimental": exp,
            "clusters": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected}
                         for s in hub().sessions.values()],
            "projects": [_json(p) for p in items if not (p.is_latex and exp)]}


def slug(name: str) -> str:
    return re.sub(r"[^\w.-]+", "-", name.strip()).strip("-") or "project"


def _checked(cluster: str, name: str, path: str) -> Project:
    """The project as it is on the cluster: path expanded, and its main .tex if it is a paper. Unchecked while the
    cluster is not connected (checked the first time you open it)."""
    s = hub().session(cluster)
    if not s.connected:
        return Project(name, cluster, path)
    target = remote_fs.expand(s.ssh, path)
    if s.ssh.run(f"test -d {remote_fs.q(target)}", timeout=30).returncode != 0:
        raise RuntimeError(f"No folder {target} on {s.cfg.name}")
    mains = store.find_main_tex(s.ssh, target)
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
    """Add a folder that is already on a cluster."""
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
        same = fresh.path == p.path and fresh.cluster == p.cluster
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
    """Mark it opened now (the list is most recent first), with ~ expanded once the cluster is connected."""
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
    """Make a new folder from a template inside parent, and add it."""
    name = name.strip()
    if not name:
        raise ValueError("Give the project a name")
    if template not in store.TEMPLATES:
        raise ValueError(f"No template {template}")
    s = hub().session(cluster)
    if not s.connected:
        raise RuntimeError(f"Connect to {s.cfg.name} first to create the folder")
    target = posixpath.join(remote_fs.expand(s.ssh, parent.strip() or "~"), slug(name))
    res = s.ssh.run(store.create_command(target, template, name, git), timeout=60)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Could not create the folder (does it exist already?)")
    mains = store.find_main_tex(s.ssh, target)
    return _add(Project(name, cluster, target, main_tex=mains[0] if mains else "",
                        kind="latex" if template == "LaTeX paper" else "code"))


# -- choosing a folder ---------------------------------------------------------------------
def _home(cluster: str) -> str:
    if cluster not in _homes:
        _homes[cluster] = remote_fs.home(hub().connected(cluster).ssh)
    return _homes[cluster]


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
    """The folders inside path (links to folders count)."""
    s = hub().connected(cluster)
    home = _home(cluster)
    target = home + path[1:] if path.startswith("~") else path
    target = posixpath.normpath(target) if target else home
    folders = [e.name for e in remote_fs.list_dir(s.ssh, target) if e.is_dir]
    return {"path": target, "home": home, "folders": folders}


@method("projects.mkdir")
def mkdir(cluster: str, path: str) -> None:
    remote_fs.mkdir(hub().connected(cluster).ssh, path)


# -- copy or sync to another cluster -------------------------------------------------------
def _globus_client() -> globus.Globus | None:
    cid = _app().globus_client_id
    return globus.Globus(cid) if cid else None


def _globus_missing(src: config.ClusterConfig, dst: config.ClusterConfig) -> str:
    client = _globus_client()
    missing = [] if client else ["your Globus app id"]
    if client and not client.logged_in:
        missing.append("signing in")
    missing += [f"a Globus collection for {c.name}" for c in (src, dst) if not c.globus.collection_id]
    return ", ".join(missing)


@method("projects.copy_targets")
def copy_targets(id: str) -> dict:
    """Clusters it can go to, whether each is connected and what Globus still needs for it."""
    p = _find(_load(), id)
    src = hub().session(p.cluster)
    return {"name": posixpath.basename(p.path.rstrip("/")), "copy_to": p.copy_to, "copy_into": p.copy_into,
            "targets": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected,
                         "globus_missing": _globus_missing(src.cfg, s.cfg)}
                        for s in hub().sessions.values() if s is not src]}


def _project_chats(ssh, path: str) -> list[chat_list.Chat]:
    """Claude chats started in the folder or below it; /scratch may be a link to /mmfs1/scratch."""
    real = ssh.run(f"readlink -f {remote_fs.q(path)}", timeout=30).stdout.strip().rstrip("/")
    roots = {path.rstrip("/"), real} - {""}
    return [c for c in chat_list.list_chats(ssh, "claude", CHAT_LIMIT, full_size=True)
            if any(c.cwd == r or c.cwd.startswith(r + "/") for r in roots)]


@method("projects.copy_plan")
def copy_plan(id: str) -> dict:
    """What is in the project (biggest first) and its Claude chats, so you can leave some behind."""
    p = _find(_load(), id)
    s = hub().connected(p.cluster)
    with ThreadPoolExecutor(2) as pool:
        sizes = pool.submit(transfer.subfolder_sizes, s.ssh, p.path)
        found = pool.submit(_project_chats, s.ssh, p.path)
    out: dict = {"parts": [], "chats": [], "parts_error": "", "chats_error": ""}
    try:
        out["parts"] = [{"name": n, "size": size, "keep": n != ".claude"} for n, size in sizes.result()]
    except Exception as e:  # noqa: BLE001 - shown in the dialog
        out["parts_error"] = str(e) or type(e).__name__
    try:
        out["chats"] = [{"id": c.id, "name": c.name, "size": c.size} for c in found.result()]
    except Exception as e:  # noqa: BLE001 - shown in the dialog
        out["chats_error"] = str(e) or type(e).__name__
    return out


def size_text(n: float) -> str:
    for unit in ("bytes", "kB", "MB", "GB", "TB"):
        if n < 1000 or unit == "TB":
            return f"{int(n)} bytes" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1000
    return ""


def task_line(i: globus.TaskInfo) -> str:
    if i.status == "SUCCEEDED":
        return f"Done · {size_text(i.bytes)} · {i.files} files"
    if i.cancelled:
        return "Cancelled"
    if i.status == "FAILED":
        return "Failed" + (f": {i.problem.replace('_', ' ').lower()}" if i.problem else "")
    parts = [i.problem.replace("_", " ").lower() if i.problem else "Copying" if i.files else "Counting files",
             size_text(i.bytes)]
    if i.files:
        parts.append(f"{i.files_done} of {i.files} files")
    if i.rate:
        parts.append(f"{size_text(i.rate)}/s")
    return " · ".join(parts)


class _Report:
    """Sends a copy's `transfer` events, at most a few a second while it runs."""

    def __init__(self, tid: str, title: str, p: transfer.Progress):
        self.tid, self.title, self.p, self.last = tid, title, p, 0.0

    def __call__(self, status: str, error: str = "", now: bool = True) -> None:
        t = time.monotonic()
        if not now and t - self.last < 0.3:
            return
        self.last = t
        hub().emit("transfer", {"id": self.tid, "title": self.title, "done": self.p.done, "total": self.p.total,
                                "status": status, "finished": self.p.finished, "error": error})


def _start(title: str, work) -> str:
    tid = "project-" + secrets.token_hex(6)
    p = transfer.Progress()
    _running[tid] = p
    report = _Report(tid, title, p)
    report("Starting")

    def run():
        try:
            work(p, report)
        except Exception as e:  # noqa: BLE001 - the UI shows it
            p.finished = True
            msg = "Cancelled" if p.cancelled.is_set() else str(e) or type(e).__name__
            report(msg if msg == "Cancelled" else f"Failed: {msg}", error=msg)
        finally:
            _running.pop(tid, None)
    threading.Thread(target=run, daemon=True, name=tid).start()
    return tid


def _laptop(src, path: str, dst, parent: str, skip: list[str], size: int):
    def work(p: transfer.Progress, report: _Report):
        transfer.copy(src.ssh, path, dst.ssh, parent, p,
                      lambda pr: pr.finished or report("Copying", now=False), skip, size)
        report(f"Done · {size_text(p.done)}")
    return work


def _globus(client: globus.Globus, src: config.ClusterConfig, path: str, dst: config.ClusterConfig, dest: str,
            skip: list[str]):
    def work(p: transfer.Progress, report: _Report):
        report("Sending to Globus")
        a, b = src.globus.collection_id, dst.globus.collection_id
        task = client.submit(a, client.path_for(a, path), b, client.path_for(b, dest),
                             f"{posixpath.basename(path.rstrip('/'))} to {dst.name}", True, sync_level=2, skip=skip)
        asked, fails = False, 0
        while not p.finished:
            if p.cancelled.is_set() and not asked:
                asked = True
                client.cancel(task)
            try:
                info = client.task(task)
            except Exception as e:  # noqa: BLE001 - Globus hiccups; keep asking a while
                fails += 1
                if fails >= GLOBUS_TRIES:
                    raise
                report(f"Globus: {e}")
            else:
                fails = 0
                p.done, p.total, p.finished = info.files_done, info.files, info.finished
                failed = info.status == "FAILED"
                line = "Cancelling" if asked and not p.finished else task_line(info)
                report(line, error=line if failed else "")
            if not p.finished:
                p.cancelled.wait(GLOBUS_POLL)  # wakes at once when you cancel
    return work


def _chats(src, picked: list[str], dst, dest: str):
    def work(p: transfer.Progress, report: _Report):
        found = [c for c in chat_list.list_chats(src.ssh, "claude", CHAT_LIMIT, full_size=True) if c.id in picked]
        p.total = sum(c.size for c in found)
        for c in found:
            part = transfer.Progress(cancelled=p.cancelled)
            base = p.done

            def update(pr, base=base):
                p.done = base + pr.done
                report("Copying", now=False)
            chat_copy.copy(src.ssh, c, dst.ssh, dest, part, update)
            p.done = base + part.done
        p.finished = True
        report(f"Copied {len(found)} chats. Continue them from Claude on {dst.cfg.name}")
    return work


@method("projects.copy")
def copy(id: str, to: str, into: str = "~", how: str = "laptop", skip: list[str] | None = None,
         chats: list[str] | None = None, size: int = 0) -> dict:
    """Start copying (laptop) or syncing (Globus) the project into a folder on another cluster, leaving out skip
    (names directly inside it), plus the picked Claude chats. Answers the transfer ids at once."""
    into = into.strip() or "~"
    with _lock:
        items = _load()
        p = _find(items, id)
        src, dst = hub().connected(p.cluster), hub().connected(to)
        if src is dst:
            raise ValueError("Pick another cluster")
        client = None
        if how == "globus":
            if missing := _globus_missing(src.cfg, dst.cfg):
                raise RuntimeError(f"Globus needs {missing}. Set it up on the Globus page")
            client = _globus_client()
        p.copy_to, p.copy_into = to, into
        _save(items)
    parent = remote_fs.expand(dst.ssh, into).rstrip("/") or "/"
    dest = posixpath.join(parent, posixpath.basename(p.path.rstrip("/")))
    title = f"{p.name}: {src.cfg.short_name} → {dst.cfg.short_name}:{dest}"
    if client:
        files = _start(f"{title} · Globus", _globus(client, src.cfg, p.path, dst.cfg, dest, skip or []))
    else:
        files = _start(title, _laptop(src, p.path, dst, parent, skip or [], size))
    talk = _start(f"{len(chats)} Claude chats of {p.name} → {dst.cfg.short_name}",
                  _chats(src, chats, dst, dest)) if chats else ""
    return {"id": files, "chats": talk}


@method("projects.cancel_copy")
def cancel_copy(id: str) -> None:
    p = _running.get(id)
    if p:
        p.cancelled.set()
