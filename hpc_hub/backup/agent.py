"""The agent that refines what to keep. Its answer is only data: validate() keeps what names folders the scan
found, and the copy job's commands never come from it."""

import json
import re

from ..agents import ask_all, catalog
from ..core.config import AgentSettings
from .model import CLASSES

MAX_WHY = 200
MAX_SUMMARY = 600
MAX_FOLDERS = 500
MAX_PATTERNS = 200
GLOB = re.compile(r"^[A-Za-z0-9_.*?\[\]!-]{1,100}$")
DASHES = re.compile(r"\s*[‒–—―−]\s*")

PROMPT = """You help a researcher keep important work before the cluster's scratch purge deletes it.

This folder (your working folder) holds one numbered folder per scratch folder at risk, and index.json with what
the scan found: sizes per kind of file, the soonest deletion, the biggest files. In each numbered folder:
tree.txt (the folder's first entries), readme.txt (its README's start, when there is one), scripts.txt (the first
lines of its job and driver scripts) and git.json (git facts, when it is a repository).

Decide, per folder, what is worth copying to the project folder: results and code first, writing and inputs too,
logs when small. Things that can be made again (packages, caches, builds, old checkpoints a script reproduces)
can be left out. Keep the newest checkpoint of a training run.

Write your answer to the file $OUT/plan.agent.json and nothing else, as JSON:
{"folders": [{"path": "<the folder path from index.json>", "class": "results|code|writing|inputs|logs|regen|
checkpoint|unsure", "keep": true, "why": "one short plain sentence"}],
 "patterns": [{"folder": "<path>", "glob": "ckpt_epoch*.pt", "keep": false, "except_newest": 1, "why": "..."}],
 "summary": "two or three plain sentences about what is here"}

Rules: only use folder paths from index.json. Do not run commands, do not change or delete any file. Write "why"
for a researcher: short, plain words, no dashes.
"""


def agent_command(agent: catalog.Agent, settings: AgentSettings) -> str:
    """The agent once, headless, on the prompt in $DIR/prompt.md; Claude gets file tools only, no shell."""
    line = ask_all.headless(agent, settings, '"$DIR/prompt.md"')
    if agent is catalog.CLAUDE:
        line = line.replace(" -p ", " --allowedTools Read,Write,Glob,Grep --disallowedTools Bash -p ", 1)
    return line


def clean(text: object, limit: int) -> str:
    """Plain short text: dashes become commas, control characters go, cut at limit."""
    s = "".join(ch for ch in str(text or "") if ch == " " or ch.isprintable())
    s = DASHES.sub(", ", s).strip(" ,")
    return s[:limit].rstrip()


def _safe_glob(glob: object) -> str:
    g = str(glob or "")
    return g if GLOB.match(g) and ".." not in g else ""


def validate(raw: str, folders: list[str]) -> dict:
    """The agent's answer reduced to what's allowed: known folders, known classes, simple name patterns."""
    try:
        data = json.loads(raw)
    except ValueError:
        return {"folders": [], "patterns": [], "summary": ""}
    if not isinstance(data, dict):
        return {"folders": [], "patterns": [], "summary": ""}
    known = set(folders)
    out_folders, out_patterns = [], []
    for f in (data.get("folders") or [])[:MAX_FOLDERS]:
        if not isinstance(f, dict) or f.get("path") not in known or not isinstance(f.get("keep"), bool):
            continue
        cls = f.get("class") if f.get("class") in CLASSES else ""
        out_folders.append({"path": f["path"], "class": cls, "keep": f["keep"], "why": clean(f.get("why"), MAX_WHY)})
    for p in (data.get("patterns") or [])[:MAX_PATTERNS]:
        if not isinstance(p, dict) or p.get("folder") not in known or not isinstance(p.get("keep"), bool):
            continue
        glob = _safe_glob(p.get("glob"))
        if not glob:
            continue
        newest = p.get("except_newest", 0)
        newest = newest if isinstance(newest, int) and not isinstance(newest, bool) and 0 <= newest <= 10 else 0
        out_patterns.append({"folder": p["folder"], "glob": glob, "keep": p["keep"], "except_newest": newest,
                             "why": clean(p.get("why"), MAX_WHY)})
    return {"folders": out_folders, "patterns": out_patterns, "summary": clean(data.get("summary"), MAX_SUMMARY)}
