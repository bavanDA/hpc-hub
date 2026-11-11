"""Hide what a bug report must not carry. Passwords, tokens, cookies and keys become <hidden>; what points to a
person becomes a placeholder: cluster usernames and the computer's user <user>, home folders <home>, emails <email>,
IP addresses <ip>, Slurm accounts <account>, group folders <group>, the computer's name <host>.

Every report runs through scrub() before it is shown or sent (api/methods/report.py), so what the person reads is
what leaves. Running it twice changes nothing: placeholders are never matched again."""

import re
from dataclasses import dataclass, field

HIDDEN = "<hidden>"


@dataclass
class Known:
    """Names and secrets this computer knows about, each replaced wherever it shows up."""
    users: set[str] = field(default_factory=set)
    accounts: set[str] = field(default_factory=set)
    groups: set[str] = field(default_factory=set)
    hosts: set[str] = field(default_factory=set)
    homes: set[str] = field(default_factory=set)  # this computer's home folder, as written there
    secrets: set[str] = field(default_factory=set)  # saved passwords, hidden even where no key names them


_KEY_BLOCK = re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|\Z)")
_PUBLIC_KEY = re.compile(r"\b(ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-[\w-]+|sk-[\w.@-]+openssh\.com)[ \t]+"
                         r"[A-Za-z0-9+/=]{20,}")
_HEADER = re.compile(r"(?im)^([ \t]*(?:proxy-)?(?:authorization|cookie|set-cookie|x-api-key|x-auth-token)"
                     r"[ \t]*:[ \t]*).+$")
_BEARER = re.compile(r"(?i)\b(bearer|basic)[ \t]+[A-Za-z0-9._~+/=-]{8,}")
_URL_LOGIN = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@")
# key=value, key: value and "key": "value" where the key names a secret (acSamlv2Token=..., "password": "...")
_KEY_VALUE = re.compile(
    r"""(?i)(["']?(?<![\w.-])(?:[\w.-]*(?:password|passwd|passphrase|secret|token|api[_-]?key|cookie"""
    r"""|session[_-]?id)[\w.-]*|pass|pwd|pw|otp|totp)["']?[ \t]*[:=][ \t]*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&"'}\]]+)""")
_TOKENS = re.compile(
    r"\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*"  # a JWT
    r"|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[\w-]{20,}|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16}"
    r"|AIza[\w-]{35})"
    r"|\b[0-9a-fA-F]{32,}\b"  # long hex: session ids, digests
    # long opaque strings with digits and both cases: base64 tokens (a path's slashes break them into words)
    r"|(?<![\w/.<-])(?=[\w+=-]*\d)(?=[\w+=-]*[a-z])(?=[\w+=-]*[A-Z])[\w+=-]{32,}")
_EMAIL = re.compile(r"(?<![\w.+-])[\w.%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
_OTHER_HOME = re.compile(r"(?i)(?:/mnt/home|/home|/Users|[a-z]:[\\/]+Users)[\\/]+(?!<)[^\\/\s\"':;,)\]]+")
_IPV4 = re.compile(r"(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])")
_HEX = r"[0-9a-fA-F]{1,4}"
_IPV6 = re.compile(rf"(?<![\w:])(?:(?:{_HEX}:){{7}}{_HEX}|(?:{_HEX}(?::{_HEX})*)?::(?:{_HEX}(?::{_HEX})*)?)(?![\w:])")
_KEEP_IPS = {"127.0.0.1", "0.0.0.0", "::1", "::"}  # this computer itself: nothing personal


def _ip(m: re.Match) -> str:
    ip = m.group(0)
    if ip in _KEEP_IPS:
        return ip
    if ":" in ip and len([g for g in ip.split(":") if g]) < 2:  # "::2" in a slice, not an address
        return ip
    return "<ip>"


def _names(text: str, known: Known) -> str:
    """Each name as a whole word (jdoe in /home/jdoe or jdoe_old, not in jdoex), any case, the longest first in one
    pass, so a computer called jdoe-laptop becomes <host>, not <user>-laptop."""
    places = {}
    for names, placeholder in ((known.hosts, "<host>"), (known.groups, "<group>"), (known.accounts, "<account>"),
                               (known.users, "<user>")):
        places.update({n.lower(): placeholder for n in names if len(n) >= 2})
    if not places:
        return text
    words = sorted(places, key=len, reverse=True)
    pattern = re.compile(r"(?<![A-Za-z0-9<])(?:" + "|".join(map(re.escape, words)) + r")(?![A-Za-z0-9>])", re.I)
    return pattern.sub(lambda m: places[m.group(0).lower()], text)


def scrub(text: str, known: Known | None = None) -> str:
    """The text with secrets hidden and personal names replaced by placeholders."""
    known = known or Known()
    for secret in sorted((s for s in known.secrets if len(s) >= 4), key=len, reverse=True):
        text = text.replace(secret, HIDDEN)
    text = _KEY_BLOCK.sub(HIDDEN, text)
    text = _PUBLIC_KEY.sub(lambda m: f"{m.group(1)} {HIDDEN}", text)
    text = _HEADER.sub(lambda m: m.group(1) + HIDDEN, text)
    text = _BEARER.sub(lambda m: f"{m.group(1)} {HIDDEN}", text)
    text = _URL_LOGIN.sub(lambda m: f"{m.group(1)}<user>:{HIDDEN}@", text)
    text = _KEY_VALUE.sub(lambda m: m.group(1) + HIDDEN, text)
    text = _TOKENS.sub(HIDDEN, text)
    text = _EMAIL.sub("<email>", text)
    for home in sorted((h.rstrip("/\\") for h in known.homes if len(h) > 1), key=len, reverse=True):
        for spelled in {home, home.replace("\\", "/")}:
            text = re.sub(re.escape(spelled) + r"(?![\w.-])", "<home>", text, flags=re.I)
    text = _OTHER_HOME.sub("<home>", text)
    text = _names(text, known)
    text = _IPV4.sub(_ip, text)
    return _IPV6.sub(_ip, text)
