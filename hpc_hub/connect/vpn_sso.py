"""AnyConnect SAML sign-in done by the app (servers whose SSO openconnect can't drive, e.g. NJIT).

1. init: ask the gateway for its SSO login URL
2. the app shows that page and reads the token cookie when it reaches the final URL
3. finish: trade the token for the VPN session cookie
"""

import base64
import hashlib
import re
import socket
import ssl
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html import unescape
from xml.sax.saxutils import escape

VERSION = "4.10.07061"


class SsoError(Exception):
    pass


@dataclass
class SsoStart:
    gateway_url: str
    login_url: str
    final_url: str
    token_cookie: str
    error_cookie: str
    opaque: str


def _post(url: str, body: str, useragent: str) -> tuple[str, str]:
    req = urllib.request.Request(url, data=body.encode(), method="POST", headers={
        "User-Agent": useragent, "X-Transcend-Version": "1", "X-Aggregate-Auth": "1",
        "X-Support-HTTP-Auth": "true", "Content-Type": "application/x-www-form-urlencoded", "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.geturl(), r.read().decode(errors="replace")
    except OSError as e:
        raise SsoError(f"Cannot reach VPN server: {e}") from e


def _tag(xml: str, name: str) -> str:
    m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", xml, re.S)
    return unescape(m.group(1).strip()) if m else ""


def init_body(gateway_url: str) -> str:
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<config-auth client="vpn" type="init" aggregate-auth-version="2">'
            f'<version who="vpn">{VERSION}</version><device-id>linux-64</device-id>'
            f'<group-access>{escape(gateway_url)}</group-access>'
            f'<capabilities><auth-method>single-sign-on-v2</auth-method></capabilities></config-auth>')


def finish_body(opaque: str, token: str) -> str:
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<config-auth client="vpn" type="auth-reply" aggregate-auth-version="2">'
            f'<version who="vpn">{VERSION}</version><device-id>linux-64</device-id>'
            f'<session-token/><session-id/>{opaque}'
            f'<auth><sso-token>{escape(token)}</sso-token></auth></config-auth>')


def parse_start(xml: str, gateway_url: str) -> SsoStart | None:
    login = _tag(xml, "sso-v2-login")
    if not login:
        return None
    m = re.search(r"<opaque is-for=\"sg\">.*?</opaque>", xml, re.S)
    return SsoStart(gateway_url, login, _tag(xml, "sso-v2-login-final"),
                    _tag(xml, "sso-v2-token-cookie-name") or "acSamlv2Token",
                    _tag(xml, "sso-v2-error-cookie-name") or "acSamlv2Error", m.group(0) if m else "")


def parse_session(xml: str) -> str:
    token = _tag(xml, "session-token")
    if token:
        return token
    msg = _tag(xml, "message") or _tag(xml, "error") or "VPN server did not accept the sign-in"
    raise SsoError(msg)


def start(gateway: str, useragent: str) -> SsoStart | None:
    url = gateway if "://" in gateway else f"https://{gateway}/"
    final_url, xml = _post(url, init_body(url.rstrip("/")), useragent)
    return parse_start(xml, final_url)


def server_pin(host: str, port: int = 443) -> str:
    """openconnect-style pin-sha256 of the server's public key (NetworkManager needs it)."""
    from cryptography import x509
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    ctx = ssl.create_default_context()
    try:
        with (socket.create_connection((host, port), timeout=20) as raw,
              ctx.wrap_socket(raw, server_hostname=host) as tls):
            der = tls.getpeercert(binary_form=True)
    except OSError as e:
        raise SsoError(f"Cannot check VPN server certificate: {e}") from e
    public = x509.load_der_x509_certificate(der).public_key()
    spki = public.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    return "pin-sha256:" + base64.b64encode(hashlib.sha256(spki).digest()).decode()


def finish(s: SsoStart, token: str, useragent: str) -> tuple[str, str]:
    """Returns (session cookie, host to connect to)."""
    _, xml = _post(s.gateway_url, finish_body(s.opaque, token), useragent)
    return parse_session(xml), urllib.parse.urlsplit(s.gateway_url).hostname or ""
