"""The five status kinds, the same in the GTK app (ui/status.py) and the desktop app (ui.tsx statusKind)."""

import re
from pathlib import Path

import pytest

from hpc_hub.ui.status import kind_for

CASES = [
    ("Connected", "success"), ("RUNNING", "success"), ("Approve Duo on your phone", "warning"),
    ("PENDING", "warning"), ("Connecting VPN", "info"), ("Signing in", "info"), ("Requesting compute node", "info"),
    ("COMPLETING", "info"), ("FAILED", "error"), ("TIMEOUT", "error"), ("OUT_OF_MEMORY", "error"),
    ("Error", "error"), ("Disconnected", "neutral"), ("COMPLETED", "neutral"), ("CANCELLED", "neutral"),
]


@pytest.mark.parametrize("state, kind", CASES)
def test_kind_for(state, kind):
    assert kind_for(state) == kind


def _words(patterns: list[str]) -> set[str]:
    """The alternatives of some regex patterns: "^(a|b)\\b" gives {"a", "b"}."""
    return {w.strip() for p in patterns for w in re.sub(r"\\[a-z]|[()^]", "", p).split("|") if w.strip()}


def test_desktop_app_uses_the_same_words():
    """The patterns in ui.tsx must match ours, or the two apps color the same job differently."""
    root = Path(__file__).parents[2]
    ui = (root / "app" / "src" / "components" / "ui.tsx").read_text()
    ts = ui[ui.index("export function statusKind"):]
    ts = ts[:ts.index("\n}\n")]
    py = (root / "hpc_hub" / "ui" / "status.py").read_text()
    py = py[py.index("def kind_for"):py.index("class StatusPill")]
    ts_words = _words(re.findall(r"/([^/\n]+)/", ts))
    py_words = _words(["".join(re.findall(r'r"([^"]*)"', line)) for line in py.splitlines() if 'r"' in line])
    assert ts_words == py_words
