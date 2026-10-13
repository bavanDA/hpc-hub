"""Build LaTeX on the cluster with latexmk and read errors from the log."""

import posixpath
import re
import shlex
from dataclasses import dataclass

from . import remote
from .config import LatexSettings

ERROR_RE = re.compile(r"^(?:\./)?([^:\s][^:]*\.(?:tex|sty|cls|bib|bbl)):(\d+): (.+)$", re.M)


@dataclass
class LatexIssue:
    file: str
    line: int
    message: str


def build_command(main_tex: str, s: LatexSettings, job_id: str | None = None) -> str:
    folder, name = posixpath.split(main_tex)
    engine = {"pdf": "-pdf", "xelatex": "-pdfxe", "lualatex": "-pdflua"}.get(s.engine, "-pdf")
    tool = (f"latexmk {engine} -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error "
            f"{shlex.quote(name)}")
    steps = f"{s.setup.strip()} && {tool}" if s.setup.strip() else tool
    script = f"{remote.cd_part(folder or '.')} && {steps}"
    if job_id and s.on_node:
        return f"srun --jobid={int(job_id)} --overlap bash -lc {shlex.quote(script)}"
    return f"bash -lc {shlex.quote(script)}"


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
