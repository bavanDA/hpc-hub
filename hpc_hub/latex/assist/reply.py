"""What the agent printed, and the JSON object in it."""

import json

MARK = "@@hpchub-answer@@"  # what the agent printed starts after this line (a login shell may print first)


def json_object(text: str) -> dict | None:
    """The JSON object in an answer, also inside ``` fences or after a sentence."""
    t = text.strip()
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        d = json.loads(t[a:b + 1])
    except ValueError:
        return None
    return d if isinstance(d, dict) else None


def answer(stdout: str) -> str:
    """What the agent printed: everything after the mark (a login shell may print before it)."""
    _, found, after = stdout.rpartition(MARK + "\n")
    return after if found else stdout
