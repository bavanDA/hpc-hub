import posixpath
import re
import shlex
from dataclasses import asdict, dataclass

from ..core import remote
from ..core.config import LatexSettings

ERROR_RE = re.compile(r"^(?:\./)?([^:\s][^:]*\.(?:tex|sty|cls|bib|bbl)):(\d+): (.+)$", re.M)
WARN_RE = re.compile(r"^(?:LaTeX|Package \S+|Class \S+) Warning: (.+?)(?: on input line (\d+))?\.?$")
BOX_RE = re.compile(r"^((?:Over|Under)full \\[hv]box \([^)]*\)) (?:in paragraph|detected|has occurred while "
                    r"\\output is active)?(?: at lines? (\d+))?")
BRACKET_RE = re.compile(r"[()]")
FILE_RE = re.compile(r"\(((?:\.{0,2}/)?[^\s()]+\.tex)")


@dataclass
class LatexIssue:
    file: str
    line: int
    message: str


def with_setup(script: str, setup: str) -> str:
    """The build setup ("module load ...") first, which needs a login shell."""
    return f"bash -lc {shlex.quote(f'{setup.strip()} && {script}')}" if setup.strip() else script


def build_script(main_tex: str, s: LatexSettings) -> str:
    """latexmk if the cluster has it, else pdflatex and bibtex by hand."""
    folder, name = posixpath.split(main_tex)
    flag, binary = {"xelatex": ("-pdfxe", "xelatex"), "lualatex": ("-pdflua", "lualatex")}.get(
        s.engine, ("-pdf", "pdflatex"))
    q, base = shlex.quote(name), shlex.quote(posixpath.splitext(name)[0])
    once = f"{binary} -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error {q}"
    tool = (f"if command -v latexmk >/dev/null 2>&1; then "
            f"latexmk {flag} -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error {q}; "
            f"else {once} && {{ ! grep -q '\\\\citation' {base}.aux 2>/dev/null || bibtex {base}; }} "
            f"&& {once} && {once}; fi")
    return with_setup(f"{remote.cd_part(folder or '.')} && {tool}", s.setup)


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


def issues(log: str) -> list[dict]:
    """Errors first, then warnings and bad boxes, each in the file TeX was reading then."""
    out = [{**asdict(i), "level": "error"} for i in parse_issues(log)]
    seen, files = set(), []  # what TeX has open, by the brackets in its log
    for raw in log.splitlines():
        m = WARN_RE.match(raw) or BOX_RE.match(raw)
        if m:
            level = "warning" if raw.startswith(("LaTeX", "Package", "Class")) else "box"
            msg, line = m.group(1).strip(), int(m.group(2) or 0)
            key = (level, msg, line)
            if key not in seen:
                seen.add(key)
                here = next((f for f in reversed(files) if f), "")
                out.append({"file": posixpath.basename(here), "line": line, "message": msg, "level": level})
        for b in BRACKET_RE.finditer(raw):
            if b.group() == "(":
                fm = FILE_RE.match(raw, b.start())
                files.append(fm.group(1) if fm else "")
            elif files:
                files.pop()
    return out[:200]
