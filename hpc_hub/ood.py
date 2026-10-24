"""Talk to an Open OnDemand web portal (e.g. the Expanse portal) with the sign-in from your Chrome profile:
find your username and home folder, and add this computer's SSH key, so the app can log in with it."""

import html
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request

from .core import browser
from . import chrome_cookies

COOKIES = ("mod_auth_openidc_session", "_session_id")
DASHBOARD = "/pun/sys/dashboard"
FILES = DASHBOARD + "/files/fs"


class PortalError(Exception):
    pass


def parse_user(page: str) -> str:
    m = re.search(r'Logged in as ([A-Za-z0-9._-]+)"', page)
    return m.group(1) if m else ""


def parse_home(page: str) -> str:
    m = re.search(r'title="Home Directory"[^>]*href="' + re.escape(FILES) + r'([^"]+)"', page)
    return html.unescape(m.group(1)) if m else ""


def parse_csrf(page: str) -> str:
    m = re.search(r'<meta name="csrf-token" content="([^"]+)"', page)
    return html.unescape(m.group(1)) if m else ""


def with_key(current: str, key: str) -> str | None:
    """authorized_keys with the key added, or None if it is there already."""
    body = " ".join(key.split()[:2])  # type and key; the comment may differ
    if any(" ".join(line.split()[:2]) == body for line in current.splitlines()):
        return None
    return current + ("" if not current or current.endswith("\n") else "\n") + key.strip() + "\n"


def tls_context(host: str) -> ssl.SSLContext:
    """Some portals send the wrong intermediate certificate (browsers fetch the right one): fetch it the same
    way, from the address in the server's certificate. The chain is still checked up to a trusted root."""
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(f"https://{host}/", timeout=15, context=ctx):
            return ctx
    except urllib.error.HTTPError:
        return ctx  # TLS was fine
    except urllib.error.URLError as e:
        if not isinstance(e.reason, ssl.SSLCertVerificationError):
            raise PortalError(f"Can't reach {host}: {e.reason}") from e
    from cryptography import x509
    from cryptography.hazmat.primitives.serialization import Encoding
    from cryptography.x509.oid import AuthorityInformationAccessOID, ExtensionOID
    leaf = x509.load_pem_x509_certificate(ssl.get_server_certificate((host, 443), timeout=15).encode())
    aia = leaf.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS).value
    url = next(d.access_location.value for d in aia if d.access_method == AuthorityInformationAccessOID.CA_ISSUERS)
    with urllib.request.urlopen(url, timeout=15) as r:
        issuer = x509.load_der_x509_certificate(r.read())
    ctx.load_verify_locations(cadata=issuer.public_bytes(Encoding.PEM).decode())
    return ctx


class Portal:
    def __init__(self, url: str, chrome_profile: str):
        self.base = url.rstrip("/")
        self.host = urllib.parse.urlsplit(self.base).hostname or ""
        p = browser.find(chrome_profile)
        if not p:
            raise PortalError(f"No Chrome profile named {chrome_profile}")
        self.profile = p.folder
        self.ctx: ssl.SSLContext | None = None
        self.cookies: dict[str, str] = {}

    def _request(self, path: str, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
        self.ctx = self.ctx or tls_context(self.host)
        jar = "; ".join(f"{k}={v}" for k, v in self.cookies.items() if v)
        req = urllib.request.Request(self.base + urllib.parse.quote(path, safe="/?=&~"), data=data, method=method,
                                     headers={"Cookie": jar, "Accept": "*/*", **(headers or {})})  # no Accept: HTTP 500
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=self.ctx), _NoRedirect)
        try:
            with opener.open(req, timeout=30) as r:
                return r.status, r.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(errors="replace")

    def signed_in(self) -> tuple[str, str, str]:
        """(username, home folder, csrf token) if Chrome is signed in to the portal, else empty strings."""
        self.cookies = {n: chrome_cookies.read(self.profile, self.host, n) for n in COOKIES}
        if not self.cookies["mod_auth_openidc_session"]:
            return "", "", ""
        status, page = self._request(DASHBOARD)
        user = parse_user(page) if status == 200 else ""
        return (user, parse_home(page), parse_csrf(page)) if user else ("", "", "")

    def _exists(self, folder: str, name: str) -> bool:
        status, body = self._request(FILES + folder, headers={"Accept": "application/json"})
        if status != 200:
            raise PortalError(f"Can't list {folder} (HTTP {status})")
        return any(f.get("name") == name for f in json.loads(body).get("files", []))

    def add_key(self, home: str, csrf: str, key: str) -> bool:
        """Append key to ~/.ssh/authorized_keys. False if it was there already."""
        ssh, path = f"{home}/.ssh", f"{home}/.ssh/authorized_keys"
        if not self._exists(home, ".ssh"):
            self._put(ssh + "?dir=true", b"", csrf)
        current = ""
        if self._exists(ssh, "authorized_keys"):
            status, current = self._request(FILES + path + "?download=1")
            if status != 200:
                raise PortalError(f"Can't read authorized_keys (HTTP {status}); nothing changed")
        new = with_key(current, key)
        if new is None:
            return False
        self._put(path, new.encode(), csrf)
        return True

    def _put(self, path: str, data: bytes, csrf: str) -> None:
        status, body = self._request(FILES + path, "PUT", data, {"X-CSRF-Token": csrf,
                                                                 "Content-Type": "text/plain"})
        if status not in (200, 204):
            raise PortalError(f"The portal refused to save {path.split('?')[0]} (HTTP {status})")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # a redirect means: not signed in (it goes to the login page)
