"""The sign-in wording follows the house rules, and the desktop app's copy is made from the Python one."""

import re
from pathlib import Path

from hpc_hub.core import login_copy

APP = Path(__file__).resolve().parents[2] / "app" / "src" / "components" / "clusters"


def _all(value) -> list[str]:
    return [s for v in value.values() for s in _all(v)] if isinstance(value, dict) else [value]


def _ts_strings(path: Path) -> list[str]:
    return [m.group(2) for m in re.finditer(r"(['\"`])((?:(?!\1).)*)\1", path.read_text(encoding="utf-8"))]


def _broken(text: str) -> list[str]:
    rules = {r"\bif\b": "narrates a branch ('if')", r"\bLog ?in\b": "says Log in, not Sign in",
             "[–—]": "has a dash"}
    return [why for rule, why in rules.items() if re.search(rule, text, re.I if "if" in rule else 0)]


def test_the_desktop_copy_is_current():
    assert login_copy.TS_FILE.read_text(encoding="utf-8") == login_copy.typescript(), \
        "run: python -m hpc_hub.core.login_copy"


def test_house_rules():
    strings = [s for v in login_copy.strings().values() for s in _all(v) if not s.startswith("http")]
    bad = {s: _broken(s) for s in strings if _broken(s)}
    assert not bad
    assert sum(s.count("{name}") for s in strings) == 1  # the full name only in the title


def test_house_rules_in_the_key_panel():
    bad = {s: _broken(s) for s in _ts_strings(APP / "KeyPanel.tsx") if " " in s and _broken(s)}
    assert not bad
