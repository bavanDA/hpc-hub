"""Projects: a named folder on a cluster (myproject, mc, paper...). Saved in projects.toml."""

import posixpath
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
