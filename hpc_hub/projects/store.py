"""Projects: a named folder on a cluster (myproj, thesis, paper...). Saved in projects.toml."""

import json
import os
import posixpath
import shlex
import time
import tomllib
from dataclasses import asdict, dataclass, fields
from pathlib import Path

from ..core.config import CONFIG_DIR, _toml_value
from ..core.ssh import SshMaster

PROJECTS_FILE = CONFIG_DIR / "projects.toml"
REMOVED = "projects-removed.json"  # next to the projects: cluster:path -> when, so a sync doesn't bring it back
TEMPLATES = ["Empty", "LaTeX paper", "Python"]

LATEX_MAIN = r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,graphicx,hyperref}

\title{%s}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}

\end{document}
"""


@dataclass
class Project:
    name: str
    cluster: str  # cluster id
    path: str  # absolute folder on the cluster
    main_tex: str = ""  # relative to path, for the LaTeX tab
    opened: int = 0  # last opened, unix time
    kind: str = ""  # "code" or "latex"; empty in old files
    copy_to: str = ""  # cluster id it was last copied or synced to
    copy_into: str = ""  # folder there it went into
    updated: int = 0  # last added or changed, unix time: the newer one wins a sync (projects/sync.py)

    @property
    def is_latex(self) -> bool:
        """LaTeX papers live in the LaTeX tab, code in Projects. Old entries: a main .tex at the top."""
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
        lines += [f"{k} = {_toml_value(v)}" for k, v in asdict(p).items()]
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


def find_main_tex(ssh: SshMaster, folder: str) -> list[str]:
    """.tex files with \\documentclass, nearest first (relative paths)."""
    cmd = (f"cd {shlex.quote(folder)} && find . -maxdepth 3 -name '*.tex' -type f 2>/dev/null "
           f"| xargs -r grep -l '^[^%]*\\\\documentclass' 2>/dev/null | sed 's|^./||' | head -50")
    found = ssh.run(cmd, timeout=60).stdout.split("\n")
    return sorted((f for f in found if f), key=lambda f: (f.count("/"), f != "main.tex", f))


# .tex files that start a document, in home, project and scratch; newest first
PAPERS = r"""R="$HOME"
for d in /mmfs1/project/*/"$USER" /mmfs1/scratch/*/"$USER" "$SCRATCH" "$PROJECT"; do
  [ -d "$d" ] && R="$R $d"
done
timeout 60 find $R -maxdepth 6 \( -name '.*' -o -name node_modules -o -name '*conda*' -o -name '*venv*' \
  -o -name __pycache__ \) -prune -o -name '*.tex' -type f -print 2>/dev/null | head -5000 |
while IFS= read -r f; do
  grep -qs '^[^%]*\\documentclass' "$f" && printf '%s|%s\n' "$(stat -c %Y "$f")" "$f"
done"""


@dataclass
class Paper:
    folder: str
    main: str  # file name inside folder
    mtime: int
    others: int = 0  # more .tex files with \documentclass in the same folder


def parse_papers(text: str) -> list[Paper]:
    """One paper per folder: main.tex if there is one, else its newest file."""
    by_folder: dict[str, list[tuple[int, str]]] = {}
    for line in text.splitlines():
        t, _, path = line.partition("|")
        if t.isdigit() and path.endswith(".tex"):
            by_folder.setdefault(posixpath.dirname(path), []).append((int(t), posixpath.basename(path)))
    out = []
    for folder, files in by_folder.items():
        files.sort(reverse=True)
        main = next((f for f in files if f[1] == "main.tex"), files[0])
        out.append(Paper(folder, main[1], max(t for t, _ in files), len(files) - 1))
    return sorted(out, key=lambda p: -p.mtime)


def find_papers(ssh: SshMaster) -> list[Paper]:
    return parse_papers(ssh.run(PAPERS, timeout=90, fast=True).stdout)


def _papers_file(cluster: str) -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "hpc-hub" / f"papers-{cluster}.json"


def save_papers(cluster: str, papers: list[Paper]) -> None:
    """Remember what the last search found, so the list shows at once next time."""
    f = _papers_file(cluster)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"at": int(time.time()), "papers": [asdict(x) for x in papers]}))


def load_papers(cluster: str) -> tuple[list[Paper], int]:
    """(papers, when they were found) from the last search; ([], 0) if none."""
    try:
        raw = json.loads(_papers_file(cluster).read_text())
        return [Paper(**x) for x in raw["papers"]], int(raw["at"])
    except (OSError, ValueError, KeyError, TypeError):
        return [], 0


def create_command(folder: str, template: str, title: str, git_init: bool) -> str:
    """Shell line that makes the project folder (fails if it already exists)."""
    q = shlex.quote(folder)
    steps = [f"mkdir -p {shlex.quote(posixpath.dirname(folder.rstrip('/')) or '/')}", f"mkdir {q}", f"cd {q}"]
    if template == "LaTeX paper":
        steps.append(f"printf %s {shlex.quote(LATEX_MAIN % title)} > main.tex")
        ignore = "*.aux\n*.log\n*.out\n*.fls\n*.fdb_latexmk\n*.synctex.gz\n*.bbl\n*.blg\n"
        steps.append(f"printf %s {shlex.quote(ignore)} > .gitignore")
    elif template == "Python":
        steps.append(f"printf %s {shlex.quote('# ' + title + chr(10))} > README.md")
        steps.append("printf 'print(\"hello\")\\n' > main.py")
        steps.append(f"printf %s {shlex.quote('__pycache__/' + chr(10) + '.venv/' + chr(10))} > .gitignore")
    if git_init:
        steps.append("git init -q")
    return " && ".join(steps)


class ProjectStore:
    """The project list plus change listeners (Projects tab, LaTeX tab)."""

    def __init__(self, path: Path = PROJECTS_FILE):
        self.path = path
        self.items = load(path)
        self.listeners: list = []

    def changed(self) -> None:
        save(self.items, self.path)
        for fn in self.listeners:
            fn()

    def add(self, p: Project) -> None:
        self.items.append(p)
        self.changed()

    def remove(self, p: Project) -> None:
        self.items.remove(p)
        self.changed()

    def touch(self, p: Project) -> None:
        p.opened = int(time.time())
        self.changed()

    def find(self, cluster: str, path: str) -> Project | None:
        path = path.rstrip("/")
        return next((p for p in self.items if p.cluster == cluster and p.path.rstrip("/") == path), None)

    def recent(self) -> list[Project]:
        return sorted(self.items, key=lambda p: (-p.opened, p.name.lower()))
