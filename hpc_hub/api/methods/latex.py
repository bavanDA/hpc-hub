"""LaTeX papers on the clusters, like Overleaf: pick a project, edit its files, build with latexmk on the cluster
(log as `latex-log` events, the end as a `latex-build` event), jump between the PDF and the source with SyncTeX,
and git (status, history, commit, pull, push). Also PDF bytes in chunks, for the PDF viewer."""

import posixpath
import re
import secrets
import shlex
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field

from ...core.config import LATEX_ENGINES
from ...files import remote_fs
from ...latex import build as latex
from ...latex import git, synctex
from ...projects import store
from ...projects.store import Project
from ..hub import hub
from ..server import method

EDIT_LIMIT = 8 * 1024 * 1024
CHUNK = 4 * 1024 * 1024
LOG_LIMIT = 2 * 1024 * 1024
LOG_EVERY = 0.25  # seconds between log events while a build runs
BUILD_SECONDS = 900
BUILD_OUTPUT = (".aux", ".log", ".out", ".toc", ".fls", ".fdb_latexmk", ".synctex.gz", ".bbl", ".blg", ".lof",
                ".lot", ".nav", ".snm", ".bcf", ".run.xml", ".xdv")
# "d path" / "f path" for everything in the project, minus hidden folders and LaTeX's own output
TREE = ("find . -maxdepth 6 \\( -name '.?*' -o -name _minted\\* \\) -prune -o -mindepth 1 "
        "\\( -type d -printf 'd %P\\n' -o -type f " + " ".join(f"! -name '*{e}'" for e in BUILD_OUTPUT)
        + " -printf 'f %P\\n' \\) | sort -k2 | head -3000")

_lock = threading.Lock()
_builds: dict[str, "Build"] = {}
_syncs: dict[tuple[str, str], tuple[str, synctex.SyncTex]] = {}  # (cluster, file) -> (mtime, parsed)


def _ssh(cluster: str):
    return hub().connected(cluster).ssh


def _inside(folder: str, path: str) -> str:
    """path, if it is in the project folder (never the folder itself)."""
    folder, path = posixpath.normpath(folder), posixpath.normpath(path)
    if not path.startswith(folder.rstrip("/") + "/"):
        raise ValueError("That is outside the project")
    return path


def _name(name: str) -> str:
    name = name.strip()
    if not name or "/" in name or name in (".", ".."):
        raise ValueError("Pick a name without /")
    return name


# -- the picker ----------------------------------------------------------------------------
def short(folder: str) -> str:
    """/mmfs1/scratch/mygroup/jdoe/thesis/paper -> scratch/thesis/paper; home becomes ~."""
    m = re.match(r"^(?:/mmfs1)?/(scratch|project)/[^/]+/[^/]+(/.*)?$", folder)
    if m:
        return m.group(1) + (m.group(2) or "")
    return re.sub(r"^(?:/mmfs1)?/home/[^/]+", "~", folder)


def _project_json(p: Project) -> dict:
    s = hub().sessions.get(p.cluster)
    return {"id": f"{p.cluster}:{p.path}", "name": p.name, "cluster": p.cluster,
            "cluster_name": s.cfg.name if s else p.cluster, "path": p.path, "main_tex": p.main_tex,
            "opened": p.opened}


def _paper_json(cluster: str, p: store.Paper) -> dict:
    parent, name = posixpath.split(p.folder)
    s = hub().sessions.get(cluster)
    return {"cluster": cluster, "cluster_name": s.cfg.name if s else cluster, "folder": p.folder, "main": p.main,
            "mtime": p.mtime, "others": p.others, "short": short(p.folder),
            "title": f"{posixpath.basename(parent)} / {name}" if parent and parent != "/" else name}


@method("latex.picker")
def picker() -> dict:
    """Your LaTeX projects (newest first), papers the last search found, and the clusters."""
    sessions = hub().sessions
    items = sorted(store.load(store.PROJECTS_FILE), key=lambda p: (-p.opened, p.name.lower()))
    papers, found_at = [], {}
    for cid in sessions:
        found, at = store.load_papers(cid)
        if at:
            found_at[cid] = at
            papers += [_paper_json(cid, p) for p in found]
    papers.sort(key=lambda p: -p["mtime"])
    return {"clusters": [{"id": s.cfg.id, "name": s.cfg.name, "connected": s.connected} for s in sessions.values()],
            "projects": [_project_json(p) for p in items if p.is_latex and p.cluster in sessions],
            "papers": papers[:60], "found_at": found_at}


@method("latex.scan")
def scan(cluster: str) -> list[dict]:
    """Look for .tex files with \\documentclass in home, project and scratch (takes a few seconds)."""
    found = store.find_papers(_ssh(cluster))
    store.save_papers(cluster, found)
    return [_paper_json(cluster, p) for p in found]


@method("latex.forget")
def forget(cluster: str, path: str) -> None:
    """Off the list only: the folder stays on the cluster."""
    with _lock:
        items = store.load(store.PROJECTS_FILE)
        keep = [p for p in items if not (p.cluster == cluster and p.path.rstrip("/") == path.rstrip("/"))]
        store.save(keep, store.PROJECTS_FILE)


def _remember(cluster: str, folder: str, main_rel: str) -> Project:
    """Add the paper to your projects (or update it), opened now."""
    with _lock:
        items = store.load(store.PROJECTS_FILE)
        p = next((x for x in items if x.cluster == cluster and x.path.rstrip("/") == folder.rstrip("/")), None)
        if not p:
            p = Project(posixpath.basename(folder) or folder, cluster, folder, kind="latex")
            items.append(p)
        p.main_tex, p.opened = main_rel, int(time.time())
        if not p.kind:
            p.kind = "latex"
        store.save(items, store.PROJECTS_FILE)
        return p


@method("latex.open")
def open_project(cluster: str, path: str, main: str = "") -> dict:
    """Open a .tex file, or a folder (its main .tex: remembered, found, or `choices` to pick from)."""
    ssh = _ssh(cluster)
    path = remote_fs.expand(ssh, path.strip())
    if not path:
        raise ValueError("Give a path")
    if path.endswith(".tex"):
        folder, rel = posixpath.dirname(path), posixpath.basename(path)
        if ssh.run(f"test -f {shlex.quote(path)}", timeout=30).returncode != 0:
            raise FileNotFoundError(f"No file {path}")
    else:
        folder = path.rstrip("/") or "/"
        known = next((p for p in store.load(store.PROJECTS_FILE)
                      if p.cluster == cluster and p.path.rstrip("/") == folder and p.main_tex), None)
        rel = main or (known.main_tex if known else "")
        if not rel:
            found = store.find_main_tex(ssh, folder)
            if not found:
                raise FileNotFoundError(f"No .tex file with \\documentclass in {folder}")
            if len(found) > 1:
                return {"choices": found, "folder": folder}
            rel = found[0]
    p = _remember(cluster, folder, rel)
    s = hub().session(cluster)
    return {"cluster": cluster, "cluster_name": s.cfg.name, "name": p.name, "folder": folder,
            "main": posixpath.join(folder, rel), "tree": tree(cluster, folder), "settings": settings(cluster)}


@method("latex.set_main")
def set_main(cluster: str, folder: str, main: str) -> None:
    """The .tex file Build compiles, remembered for the project."""
    _remember(cluster, folder, posixpath.relpath(_inside(folder, main), folder))


# -- files ---------------------------------------------------------------------------------
@method("latex.tree")
def tree(cluster: str, folder: str) -> list[dict]:
    """Everything in the project ({kind: d|f, path: relative}), without hidden folders and build output."""
    res = _ssh(cluster).run(f"cd {shlex.quote(folder)} && {TREE}", timeout=60)
    if res.returncode != 0:
        raise remote_fs.FsError(res.stderr.strip() or f"Could not list {folder}")
    return [{"kind": line[0], "path": line[2:]} for line in res.stdout.splitlines()
            if len(line) > 2 and line[1] == " " and line[0] in "df"]


@method("latex.read")
def read(cluster: str, path: str) -> dict:
    data = remote_fs.read_bytes(_ssh(cluster), path, EDIT_LIMIT)
    if b"\0" in data[:8192]:
        raise ValueError("This is not a text file")
    return {"text": data.decode("utf-8", "replace")}


@method("latex.write")
def write(cluster: str, path: str, text: str) -> None:
    remote_fs.write_bytes(_ssh(cluster), path, text.encode())


@method("latex.new_file")
def new_file(cluster: str, folder: str, into: str, name: str) -> str:
    """An empty file in a folder of the project; returns its path. Fails if it is there already."""
    target = _inside(folder, posixpath.join(into or folder, _name(name)))
    q = shlex.quote(target)
    res = _ssh(cluster).run(f"test ! -e {q} && : > {q}", timeout=30)
    if res.returncode != 0:
        raise FileExistsError(f"{name} is there already")
    return target


@method("latex.mkdir")
def mkdir(cluster: str, folder: str, into: str, name: str) -> str:
    target = _inside(folder, posixpath.join(into or folder, _name(name)))
    remote_fs.mkdir(_ssh(cluster), target)
    return target


@method("latex.move")
def move(cluster: str, folder: str, path: str, into: str) -> str:
    """Move a file or folder into another folder of the project (into = folder for the top)."""
    src = _inside(folder, path)
    into = posixpath.normpath(into or folder)
    if into != posixpath.normpath(folder):
        _inside(folder, into)
    if into == src or into.startswith(src + "/"):
        raise ValueError("A folder can't go inside itself")
    dst = posixpath.join(into, posixpath.basename(src))
    if dst != src:
        remote_fs.rename(_ssh(cluster), src, dst)
    return dst


@method("latex.rename")
def rename(cluster: str, folder: str, path: str, name: str) -> str:
    src = _inside(folder, path)
    dst = _inside(folder, posixpath.join(posixpath.dirname(src), _name(name)))
    remote_fs.rename(_ssh(cluster), src, dst)
    return dst


@method("latex.delete")
def delete(cluster: str, folder: str, path: str) -> None:
    remote_fs.remove(_ssh(cluster), _inside(folder, path))


# -- PDFs ----------------------------------------------------------------------------------
def _stat(ssh, path: str) -> tuple[int, str] | None:
    res = ssh.run(f"stat -L -c '%s %Y' -- {shlex.quote(path)}", timeout=30)
    parts = res.stdout.split()
    return (int(parts[0]), parts[1]) if res.returncode == 0 and len(parts) == 2 else None


@method("latex.pdf")
def pdf(cluster: str, main: str) -> dict | None:
    """The built PDF's path, size and time, or None before the first build."""
    path = latex.pdf_path(main)
    st = _stat(_ssh(cluster), path)
    return {"path": path, "size": st[0], "mtime": int(st[1])} if st else None


@method("latex.chunk")
def chunk(cluster: str, path: str, offset: int = 0, length: int = CHUNK) -> dict:
    """Part of a file as base64 (any file, so big PDFs come in pieces), and its whole size."""
    offset, length = max(0, int(offset)), max(1, min(int(length), CHUNK))
    q = shlex.quote(path)
    res = _ssh(cluster).run(f"set -o pipefail; stat -L -c %s -- {q} && tail -c +{offset + 1} -- {q} "
                            f"| head -c {length} | base64 -w0", timeout=300, fast=True)
    if res.returncode != 0:
        raise remote_fs.FsError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not read file")
    total, _, data = res.stdout.partition("\n")
    return {"data": data.strip(), "total": int(total)}


# -- build ---------------------------------------------------------------------------------
@method("latex.settings")
def settings(cluster: str) -> dict:
    return asdict(hub().session(cluster).cfg.latex)


@method("latex.save_settings")
def save_settings(cluster: str, setup: str = "", engine: str = "pdf", on_node: bool = True) -> dict:
    """What runs before the build (module load ...), the engine, and whether to build on your compute node."""
    if engine not in LATEX_ENGINES:
        raise ValueError(f"No engine {engine}")
    s = hub().session(cluster).cfg.latex
    s.setup, s.engine, s.on_node = setup.strip(), engine, bool(on_node)
    hub().save_clusters()
    return asdict(s)


WARN_RE = re.compile(r"^(?:LaTeX|Package \S+|Class \S+) Warning: (.+?)(?: on input line (\d+))?\.?$")
BOX_RE = re.compile(r"^((?:Over|Under)full \\[hv]box \([^)]*\)) (?:in paragraph|detected|has occurred while "
                    r"\\output is active)?(?: at lines? (\d+))?")
BRACKET_RE = re.compile(r"[()]")
FILE_RE = re.compile(r"\(((?:\.{0,2}/)?[^\s()]+\.tex)")


def issues(log: str) -> list[dict]:
    """Errors (file:line: message) first, then warnings and bad boxes, in the file the log was reading then."""
    out = [{**asdict(i), "level": "error"} for i in latex.parse_issues(log)]
    seen, files = set(), []  # files: what TeX has open, by the brackets in its log
    for raw in log.splitlines():
        m = WARN_RE.match(raw) or BOX_RE.match(raw)
        if m:
            level = "warning" if raw.startswith(("LaTeX", "Package", "Class")) else "box"
            msg, line = m.group(1).strip(), int(m.group(2) or 0)
            here = next((f for f in reversed(files) if f), "")
            key = (level, msg, line)
            if key not in seen:
                seen.add(key)
                out.append({"file": posixpath.basename(here), "line": line, "message": msg, "level": level})
        for b in BRACKET_RE.finditer(raw):
            if b.group() == "(":
                fm = FILE_RE.match(raw, b.start())
                files.append(fm.group(1) if fm else "")
            elif files:
                files.pop()
    return out[:200]


@dataclass
class Build:
    id: str
    cluster: str
    main: str
    started: float = field(default_factory=time.monotonic)
    log: list[str] = field(default_factory=list)
    proc: subprocess.Popen | None = None
    stopped: bool = False

    def text(self) -> str:
        return "".join(self.log)


def _build_command(cluster: str, main: str) -> str:
    s = hub().connected(cluster)
    script = latex.build_script(main, s.cfg.latex)
    a = s.allocation
    if a and a.job_id and s.cfg.latex.on_node:
        return f"srun --jobid={int(a.job_id)} --overlap bash -c {shlex.quote(script)}"
    return script


@method("latex.build")
def build(cluster: str, main: str) -> dict:
    """Start latexmk on the cluster (your compute node if set). Log lines come as `latex-log` {id, text}; the end
    as `latex-build` {id, ok, code, issues, seconds, log}. Returns {id}."""
    ssh = _ssh(cluster)
    command = _build_command(cluster, main)
    b = Build(secrets.token_hex(6), cluster, main)
    with _lock:
        if any(x.cluster == cluster and x.main == main for x in _builds.values()):
            raise RuntimeError("It is building already")
        _builds[b.id] = b
    b.proc = subprocess.Popen(ssh.argv(command), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
    threading.Thread(target=_watch, args=(b,), daemon=True, name=f"latex-{b.id}").start()
    return {"id": b.id}


def _watch(b: Build) -> None:
    h, pending, last, size = hub(), [], 0.0, 0
    timer = threading.Timer(BUILD_SECONDS, lambda: _kill(b))
    timer.start()
    try:
        for line in b.proc.stdout:
            if size < LOG_LIMIT:
                b.log.append(line)
                size += len(line)
            pending.append(line)
            now = time.monotonic()
            if now - last > LOG_EVERY:
                h.emit("latex-log", {"id": b.id, "text": "".join(pending)})
                pending, last = [], now
        code = b.proc.wait()
    finally:
        timer.cancel()
        with _lock:
            _builds.pop(b.id, None)
    if pending:
        h.emit("latex-log", {"id": b.id, "text": "".join(pending)})
    log = b.text()
    h.emit("latex-build", {"id": b.id, "cluster": b.cluster, "main": b.main, "ok": code == 0 and not b.stopped,
                           "code": code, "stopped": b.stopped, "seconds": round(time.monotonic() - b.started, 1),
                           "issues": issues(log), "log": log[-200_000:]})


def _kill(b: Build) -> None:
    b.stopped = True
    if b.proc and b.proc.poll() is None:
        b.proc.terminate()


@method("latex.stop")
def stop(id: str) -> None:
    with _lock:
        b = _builds.get(id)
    if b:
        _kill(b)


# -- SyncTeX -------------------------------------------------------------------------------
def _sync(cluster: str, main: str) -> synctex.SyncTex | None:
    """The build's .synctex.gz, read again only when it changed."""
    ssh = _ssh(cluster)
    path = posixpath.splitext(main)[0] + ".synctex.gz"
    st = _stat(ssh, path)
    if not st:
        return None
    key, cached = (cluster, path), _syncs.get((cluster, path))
    if cached and cached[0] == st[1]:
        return cached[1]
    parsed = synctex.SyncTex.from_gz(remote_fs.read_bytes(ssh, path))
    _syncs[key] = (st[1], parsed)
    return parsed


@method("latex.sync_view")
def sync_view(cluster: str, main: str, path: str, line: int) -> dict | None:
    """Source line -> {page, x, y} on the PDF (points from the top left), or None."""
    st = _sync(cluster, main)
    if not st:
        raise RuntimeError("Build once to link the PDF and the source")
    spot = st.view(path, int(line), posixpath.dirname(main))
    return {"page": spot.page, "x": spot.x, "y": spot.y} if spot else None


@method("latex.sync_edit")
def sync_edit(cluster: str, main: str, page: int, x: float, y: float) -> dict | None:
    """A spot on the PDF -> {path, line} of the source that made it, or None."""
    st = _sync(cluster, main)
    if not st:
        raise RuntimeError("Build once to link the PDF and the source")
    hit = st.edit(int(page), float(x), float(y))
    if not hit or not hit[0]:
        return None
    path = hit[0] if hit[0].startswith("/") else posixpath.join(posixpath.dirname(main), hit[0])
    return {"path": posixpath.normpath(path), "line": hit[1]}


# -- git -----------------------------------------------------------------------------------
@method("latex.git_info")
def git_info(cluster: str, folder: str) -> dict:
    """Branch, remotes, changed files and the last 200 commits; root "" when it is not a repository."""
    i = git.info(_ssh(cluster), folder)
    return {"root": i.root, "branch": i.branch, "remotes": [{"name": n, "url": u} for n, u in i.remotes.items()],
            "changes": [{"status": c[:2].strip(), "path": c[3:]} for c in i.changes],
            "history": [asdict(c) for c in i.history]}


@method("latex.git_commit")
def git_commit(cluster: str, folder: str, message: str) -> str:
    if not message.strip():
        raise ValueError("Write a message first")
    return git.commit_all(_ssh(cluster), folder, message.strip())


@method("latex.git_pull")
def git_pull(cluster: str, folder: str) -> str:
    return git.pull(_ssh(cluster), folder)


@method("latex.git_push")
def git_push(cluster: str, folder: str) -> str:
    return git.push(_ssh(cluster), folder)


@method("latex.git_show")
def git_show(cluster: str, folder: str, commit: str) -> str:
    return git.show(_ssh(cluster), folder, commit)
