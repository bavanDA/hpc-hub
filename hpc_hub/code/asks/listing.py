"""The newest asks and where each one stands."""

import json
import posixpath
from dataclasses import dataclass

from .model import ROOT, check_id

STATES = ("starting", "waiting_for_node", "running", "done", "failed", "cancelled")
LIST_SEP = "\x1e"


def list_command(limit: int = 30, ask_id: str = "") -> str:
    """meta.json and state of the newest asks (or only ask_id), separated by LIST_SEP."""
    pick = f"echo {check_id(ask_id)}/" if ask_id else f"ls -1d */ 2>/dev/null | sort -r | head -n {int(limit)}"
    return (f'cd "$HOME"/{ROOT} 2>/dev/null && {pick} | '
            f"while read -r d; do d=${{d%/}}; [ -f \"$d/meta.json\" ] || continue; cat \"$d/meta.json\"; "
            f"printf '\\n{LIST_SEP}'; cat \"$d/state\" 2>/dev/null; echo; "
            f"tail -n 1 \"$d/log\" 2>/dev/null | cut -c1-200; "
            f"printf '\\n{LIST_SEP}\\n'; done")


@dataclass
class Status:
    id: str
    state: str
    kind: str
    agent: str
    path: str
    started: float
    detail: str


def detail(state: str, agent_name: str, path: str, last_line: str = "") -> str:
    name = posixpath.basename(path.rstrip("/")) or path
    return {
        "starting": "Starting",
        "waiting_for_node": "Waiting for a node",
        "running": f"{agent_name} is reading {name}",
        "done": "Answer ready",
        "failed": f"Didn't finish: {last_line}" if last_line.strip() else "Didn't finish",
        "cancelled": "Stopped",
    }.get(state, state)


def status_of(meta: dict, state: str, last_line: str = "") -> Status:
    state = state.strip() if state.strip() in STATES else "failed"
    return Status(meta.get("id", ""), state, meta.get("kind", "free"), meta.get("agent", ""), meta.get("path", ""),
                  float(meta.get("started", 0)), detail(state, meta.get("agent_name", "The agent"),
                                                        meta.get("path", ""), last_line.strip()))


def parse_list(text: str) -> list[Status]:
    out, parts = [], text.split(LIST_SEP)
    for i in range(0, len(parts) - 1, 2):
        try:
            meta = json.loads(parts[i].strip())
        except ValueError:
            continue
        state, _, last = parts[i + 1].lstrip("\n").partition("\n")
        out.append(status_of(meta, state, last if state.strip() == "failed" else ""))
    return out
