"""Decide what a login prompt (from ssh or openconnect) is asking for."""

import re

USERNAME = "username"
PASSWORD = "password"
DUO = "duo"
CODE = "code"  # a one-time code from an authenticator app (TOTP), e.g. SDSC Expanse
GROUP = "group"
PASSPHRASE = "passphrase"
UNKNOWN = "unknown"

_DUO = re.compile(r"duo|passcode|second password|secondary password|push", re.I)
_CODE = re.compile(r"totp|verification code|one[- ]time|\botp\b|authenticator|token code", re.I)


def classify(prompt: str) -> str:
    p = prompt.strip().lower()
    if "passphrase" in p:
        return PASSPHRASE
    if _CODE.search(p):
        return CODE
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


# -- Duo: how you answer it (Settings, Duo method) ---------------------------------------------------------

DUO_METHODS = ("push", "phone", "sms", "passcode")
SEND, ASK, STOP = "send", "ask", "stop"
ASK_PASSCODE = "Type a Duo passcode: from Duo Mobile (tap the key icon), a text from Duo, or your hardware token."
ASK_SMS = "Duo texted you passcodes. Type one of them."
TEXTED = "texted"  # a VPN without a menu fails on "sms" and texts the codes: the second sign-in asks for one


def duo_method(answer: str) -> str:
    """push, phone, sms or passcode, from the saved answer ("push2" is the second phone's push; a typed number,
    once allowed as the answer itself, is a passcode)."""
    a = answer.strip().lower()
    for m in DUO_METHODS:
        if a.startswith(m):
            return m
    return "passcode" if a.isdigit() else "push"


def _sms_option(prompt: str) -> str:
    m = re.search(r"^\s*(\d+)\.\s*SMS passcodes", prompt, re.I | re.M)
    return m.group(1) if m else ""


def duo_action(prompt: str, answer: str, times: int) -> tuple[str, str]:
    """What to do the n-th time (from 1) Duo asks: (SEND, text), (ASK, what to tell you), or (STOP, why). Duo asks a
    second time only after "send me texts"; any other second time means the first answer failed, and asking again
    would lock the account."""
    if answer == TEXTED:  # the VPN's second sign-in, after it texted the codes
        return (ASK, ASK_SMS) if times == 1 else (STOP, "Duo didn't accept the passcode")
    method = duo_method(answer)
    if method == "passcode":
        return (ASK, ASK_PASSCODE) if times == 1 else (STOP, "Duo didn't accept the passcode")
    if method == "sms":
        if times == 1:
            option = _sms_option(prompt)
            return (SEND, option) if option else (SEND, "sms")
        if times == 2:
            return (ASK, ASK_SMS)
        return (STOP, "Duo didn't accept the passcode")
    if times > 1:
        return (STOP, f"Duo asked again after the {'call' if method == 'phone' else 'push'}")
    return (SEND, duo_reply(prompt, answer if answer.strip() else "push"))
