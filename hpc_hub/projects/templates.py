"""What a new project folder starts with."""

import posixpath
import shlex

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
LATEX_IGNORE = "*.aux\n*.log\n*.out\n*.fls\n*.fdb_latexmk\n*.synctex.gz\n*.bbl\n*.blg\n"
PYTHON_IGNORE = "__pycache__/\n.venv/\n"


def create_command(folder: str, template: str, title: str, git_init: bool) -> str:
    """Shell line that makes the folder; fails when it exists already."""
    q = shlex.quote(folder)
    steps = [f"mkdir -p {shlex.quote(posixpath.dirname(folder.rstrip('/')) or '/')}", f"mkdir {q}", f"cd {q}"]
    if template == "LaTeX paper":
        steps.append(f"printf %s {shlex.quote(LATEX_MAIN % title)} > main.tex")
        steps.append(f"printf %s {shlex.quote(LATEX_IGNORE)} > .gitignore")
    elif template == "Python":
        steps.append(f"printf %s {shlex.quote(f'# {title}' + chr(10))} > README.md")
        steps.append("printf 'print(\"hello\")\\n' > main.py")
        steps.append(f"printf %s {shlex.quote(PYTHON_IGNORE)} > .gitignore")
    if git_init:
        steps.append("git init -q")
    return " && ".join(steps)
