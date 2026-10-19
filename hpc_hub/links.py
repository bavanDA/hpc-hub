"""Spot useful links in terminal output (VS Code tunnels, device logins, local web servers)."""

import re
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

URL_RE = re.compile(r"https?://[^\s'\"<>()\x1b]+")
CODE_RE = re.compile(r"\b([A-Z0-9]{4}-[A-Z0-9]{4})\b")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}

TUNNEL, DEVICE_LOGIN, LOCAL_WEB, REMOTE, PAIR, OTHER = (
    "tunnel", "device-login", "local-web", "remote", "pair", "other")
PAIR_RE = re.compile(r"(?:manualPairingCode\W+|pairing code\W+)([A-Z0-9]{4}-[A-Z0-9]{4})", re.I)
REMOTE_HOSTS = ("claude.ai", "chatgpt.com", "antigravity.google")


@dataclass(frozen=True)
class Link:
    kind: str
    url: str
    code: str = ""
    host: str = ""
    port: int = 0


def classify(url: str, text: str = "", node: str = "") -> Link:
    url = url.rstrip(".,;:")
    parts = urlsplit(url)
    host = parts.hostname or ""
    if host == "vscode.dev" and parts.path.startswith("/tunnel"):
        return Link(TUNNEL, url)
    if parts.path.rstrip("/") in ("/login/device", "/devicelogin") or "devicelogin" in host:
        m = CODE_RE.search(text[text.find(url):] if url in text else text) or CODE_RE.search(text)
        return Link(DEVICE_LOGIN, url, code=m.group(1) if m else "")
    if host in REMOTE_HOSTS or host.endswith(".antigravity.google"):
        if host != "claude.ai" or parts.path.startswith("/code"):
            return Link(REMOTE, url)
    if parts.scheme == "http" and parts.port and (host in LOCAL_HOSTS or (node and host.startswith(node))):
        return Link(LOCAL_WEB, url, host=host, port=parts.port)
    return Link(OTHER, url)


def find_links(text: str, node: str = "") -> list[Link]:
    seen, out = set(), []
    for m in PAIR_RE.finditer(text):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            out.append(Link(PAIR, "", code=m.group(1)))
    for m in URL_RE.finditer(text):
        link = classify(m.group(0), text, node)
        if link.url not in seen and link.kind != OTHER:
            seen.add(link.url)
            out.append(link)
    return out


def local_url(link: Link, local_port: int) -> str:
    """Rewrite a node-local URL to the forwarded laptop port."""
    p = urlsplit(link.url)
    return urlunsplit((p.scheme, f"127.0.0.1:{local_port}", p.path, p.query, p.fragment))


def tunnel_name(url: str) -> str:
    """https://vscode.dev/tunnel/<name>/<path> -> name."""
    parts = urlsplit(url).path.split("/")
    return parts[2] if len(parts) > 2 and parts[1] == "tunnel" else ""


def tunnel_urls(name: str, folder: str) -> tuple[str, str]:
    """(desktop folder-uri, browser url) for a folder on that tunnel."""
    folder = "/" + folder.strip("/") if folder.strip("/") else ""
    return f"vscode-remote://tunnel+{name}{folder}", f"https://vscode.dev/tunnel/{name}{folder}"
