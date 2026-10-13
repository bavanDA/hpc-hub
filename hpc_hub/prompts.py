"""Decide what a login prompt (from ssh or openconnect) is asking for."""

import re

USERNAME = "username"
PASSWORD = "password"
DUO = "duo"
GROUP = "group"
PASSPHRASE = "passphrase"
UNKNOWN = "unknown"

_DUO = re.compile(r"duo|passcode|second password|secondary password|push", re.I)


def classify(prompt: str) -> str:
    p = prompt.strip().lower()
    if "passphrase" in p:
        return PASSPHRASE
    if _DUO.search(p):
        return DUO
    if "password" in p:
        return PASSWORD
    if re.search(r"user ?name|login:", p):
        return USERNAME
    if re.search(r"\bgroup\b", p):
        return GROUP
    return UNKNOWN


def group_choice(prompt: str, wanted: str) -> str:
    """Answer an openconnect 'GROUP: [a|b]:' prompt."""
    m = re.search(r"\[([^\]]*)\]", prompt)
    options = [o.strip() for o in m.group(1).split("|")] if m else []
    if wanted and (not options or wanted in options):
        return wanted
    return options[0] if options else wanted


def duo_reply(prompt: str, answer: str) -> str:
    """Turn 'push'/'phone' into the menu number when Duo lists numbered options."""
    want = answer.strip().lower()
    kind = "push" if want.startswith("push") else "phone" if want.startswith("phone") else ""
    if not kind:
        return answer
    nth = int(want[len(kind):] or 1)
    label = r"duo push" if kind == "push" else r"phone call"
    found = re.findall(rf"^\s*(\d+)\.\s*{label}", prompt, re.I | re.M)
    return found[nth - 1] if len(found) >= nth else answer
