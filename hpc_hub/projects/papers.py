"""LaTeX papers on a cluster: a folder's main .tex, and the search for papers anywhere in your storage."""

import json
import os
import posixpath
import shlex
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from ..core.ssh import SshMaster

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


def find_main_tex(ssh: SshMaster, folder: str) -> list[str]:
    """.tex files with \\documentclass, nearest first (relative paths)."""
    cmd = (f"cd {shlex.quote(folder)} && find . -maxdepth 3 -name '*.tex' -type f 2>/dev/null "
           f"| xargs -r grep -l '^[^%]*\\\\documentclass' 2>/dev/null | sed 's|^./||' | head -50")
    found = ssh.read(cmd, timeout=60).stdout.split("\n")
    return sorted((f for f in found if f), key=lambda f: (f.count("/"), f != "main.tex", f))


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
    return parse_papers(ssh.read(PAPERS, timeout=90, fast=True).stdout)


def _papers_file(cluster: str) -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "hpc-hub" / f"papers-{cluster}.json"


def save_papers(cluster: str, papers: list[Paper]) -> None:
    """What the last search found, so the list shows at once next time."""
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
