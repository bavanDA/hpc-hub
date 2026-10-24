"""Remembers sizes you drag (panel widths) between runs."""

import json
from pathlib import Path

from .config import CONFIG_DIR

FILE = CONFIG_DIR / "layout.json"


def load(path: Path = FILE) -> dict[str, int]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, int)} if isinstance(data, dict) else {}


def save(sizes: dict[str, int], path: Path = FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(sizes, indent=1, sort_keys=True), encoding="utf-8")
    tmp.replace(path)
