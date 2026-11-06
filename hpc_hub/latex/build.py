"""Build LaTeX on the cluster with latexmk and read errors from the log."""

import posixpath
import re
import shlex
from dataclasses import dataclass

from ..core import remote
from ..core.config import LatexSettings

ERROR_RE = re.compile(r"^(?:\./)?([^:\s][^:]*\.(?:tex|sty|cls|bib|bbl)):(\d+): (.+)$", re.M)


@dataclass
class LatexIssue:
    file: str
    line: int
    message: str


def build_script(main_tex: str, s: LatexSettings) -> str:
    """Shell text that builds main_tex: latexmk if there is one, else pdflatex/bibtex by hand."""
    folder, name = posixpath.split(main_tex)
    flag, binary = {"xelatex": ("-pdfxe", "xelatex"), "lualatex": ("-pdflua", "lualatex")}.get(
        s.engine, ("-pdf", "pdflatex"))
    q, base = shlex.quote(name), shlex.quote(posixpath.splitext(name)[0])
    once = f"{binary} -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error {q}"
    tool = (f"if command -v latexmk >/dev/null 2>&1; then "
            f"latexmk {flag} -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error {q}; "
            f"else {once} && {{ ! grep -q '\\\\citation' {base}.aux 2>/dev/null || bibtex {base}; }} "
            f"&& {once} && {once}; fi")
    script = f"{remote.cd_part(folder or '.')} && {tool}"
    if s.setup.strip():  # "module load ..." needs a login shell
        return f"bash -lc {shlex.quote(f'{s.setup.strip()} && {script}')}"
    return script


def pdf_path(main_tex: str) -> str:
    return posixpath.splitext(main_tex)[0] + ".pdf"


def parse_issues(log: str) -> list[LatexIssue]:
    seen, out = set(), []
    for m in ERROR_RE.finditer(log):
        key = (m.group(1), m.group(2), m.group(3))
        if key not in seen:
            seen.add(key)
            out.append(LatexIssue(posixpath.basename(m.group(1)), int(m.group(2)), m.group(3).strip()))
    return out
