"""Signing in to Globus: OAuth2 with PKCE, the code pasted back from its page."""

import base64
import hashlib
import re
import secrets
import urllib.parse

AUTH = "https://auth.globus.org/v2/oauth2"
REDIRECT = "https://auth.globus.org/v2/web/auth-code"
TRANSFER_SCOPE = "urn:globus:auth:scope:transfer.api.globus.org:all"


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def merge_scopes(scopes: list[str]) -> str:
    """The transfer scope with every permission Globus asked for, so one Allow covers all collections.
    Only what Globus named: a made-up one (a collection without data_access) fails with Unknown scope."""
    deps = []
    for s in scopes:
        m = re.search(r"\[(.*)\]$", s)
        deps += m.group(1).split() if m else []
    deps = list(dict.fromkeys(deps))
    return f"{TRANSFER_SCOPE}[{' '.join(deps)}]" if deps else TRANSFER_SCOPE


def authorize_url(client_id: str, challenge: str, scope: str = TRANSFER_SCOPE, fresh: bool = True,
                  domain: str = "") -> str:
    """fresh: ask for the login again. Off when only adding permissions, so Globus just shows Allow.
    domain: make Globus sign you in with an account from there (yale.edu)."""
    return f"{AUTH}/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": REDIRECT, "scope": scope, "response_type": "code",
        "code_challenge": challenge, "code_challenge_method": "S256", "access_type": "offline",
        **({"prompt": "login"} if fresh else {}),
        **({"session_required_single_domain": domain} if domain else {}),
    })


def pasted_code(text: str) -> str:
    """The code Globus shows after sign-in, also when the whole page address was pasted."""
    text = text.strip()
    return code_from_url(text) or (text if re.fullmatch(r"[A-Za-z0-9_-]{8,200}", text) else "")


def code_from_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    if not url.startswith(REDIRECT):
        return ""
    return urllib.parse.parse_qs(parts.query).get("code", [""])[0]
