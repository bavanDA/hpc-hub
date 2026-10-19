"""Projects: a named folder on a cluster (myproject, mc, paper...). Saved in projects.toml."""

import posixpath
import time
import shlex
import tomllib
from dataclasses import asdict, dataclass, fields
from pathlib import Path

from .config import CONFIG_DIR, _toml_value
from .ssh import SshMaster

PROJECTS_FILE = CONFIG_DIR / "projects.toml"
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

    @property
    def is_latex(self) -> bool:
        """LaTeX papers live in the LaTeX tab, code in Projects. Old entries: a main .tex at the top."""
        return self.kind == "latex" or not self.kind and bool(self.main_tex) and "/" not in self.main_tex

    @property
    def folder_name(self) -> str:
        return posixpath.basename(self.path.rstrip("/")) or self.path


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


def save(projects: list[Project], path: Path = PROJECTS_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# HPC Hub projects", ""]
    for p in projects:
        lines.append("[[projects]]")
        lines += [f"{k} = {_toml_value(v)}" for k, v in asdict(p).items()]
        lines.append("")
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines), encoding="utf-8")
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
    return parse_papers(ssh.run(PAPERS, timeout=90).stdout)


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
