"""Globus transfers over the REST API (no SDK). Sign-in is OAuth2 + PKCE; tokens live in the keyring."""

import base64
import hashlib
import json
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from . import credentials

AUTH = "https://auth.globus.org/v2/oauth2"
TRANSFER = "https://transfer.api.globus.org/v0.10"
REDIRECT = "https://auth.globus.org/v2/web/auth-code"
TRANSFER_SCOPE = "urn:globus:auth:scope:transfer.api.globus.org:all"
KEY = ("globus", "tokens")


class GlobusError(Exception):
    pass


class ConsentRequired(GlobusError):
    def __init__(self, scopes: list[str]):
        super().__init__("Globus needs extra permission for this collection")
        self.scopes = scopes


@dataclass
class Collection:
    id: str
    name: str
    owner: str


@dataclass
class Item:
    name: str
    is_dir: bool
    size: int
    modified: str


def parse_ls(resp: dict) -> tuple[str, list[Item]]:
    """(absolute path, folders first then files) from an ls response."""
    items = [Item(d["name"], d.get("type") == "dir", int(d.get("size") or 0), (d.get("last_modified") or "")[:16])
             for d in resp.get("DATA", [])]
    items.sort(key=lambda i: (not i.is_dir, i.name.lower()))
    return resp.get("path", ""), items


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def data_access_scope(collection_ids: list[str]) -> str:
    deps = " ".join(f"*https://auth.globus.org/scopes/{c}/data_access" for c in collection_ids if c)
    return f"{TRANSFER_SCOPE}[{deps}]" if deps else TRANSFER_SCOPE


def authorize_url(client_id: str, challenge: str, scope: str = TRANSFER_SCOPE) -> str:
    return f"{AUTH}/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": REDIRECT, "scope": scope, "response_type": "code",
        "code_challenge": challenge, "code_challenge_method": "S256", "access_type": "offline",
        "prompt": "login",
    })


def pasted_code(text: str) -> str:
    """The code Globus shows after sign-in, also when the whole page address was pasted."""
    text = text.strip()
    return code_from_url(text) or (text if re.fullmatch(r"[A-Za-z0-9_-]{8,200}", text) else "")


def looks_like_code(text: str) -> bool:
    """Clipboard text that is probably a Globus code (long enough not to be some other copied word)."""
    code = pasted_code(text)
    return bool(code) and (len(code) >= 20 or code != text.strip())


def code_from_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    if not url.startswith(REDIRECT):
        return ""
    return urllib.parse.parse_qs(parts.query).get("code", [""])[0]


def _http(method: str, url: str, token: str = "", body: dict | None = None, form: dict | None = None) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "hpc-hub"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
    elif form is not None:
        data, headers["Content-Type"] = urllib.parse.urlencode(form).encode(), "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read() or b"{}")
        except ValueError:
            err = {}
        if err.get("code") == "ConsentRequired":
            raise ConsentRequired(err.get("required_scopes") or []) from e
        raise GlobusError(err.get("message") or err.get("error_description") or f"HTTP {e.code}") from e
    except urllib.error.URLError as e:
        raise GlobusError(f"Cannot reach Globus: {e.reason}") from e


def transfer_tokens(resp: dict) -> dict:
    """Pick the transfer.api.globus.org token out of a token response."""
    for t in [resp, *resp.get("other_tokens", [])]:
        if t.get("resource_server") == "transfer.api.globus.org":
            return {"access_token": t["access_token"], "refresh_token": t.get("refresh_token", ""),
                    "expires_at": time.time() + int(t.get("expires_in", 0)) - 60}
    raise GlobusError("Globus did not return a transfer token")


class Globus:
    def __init__(self, client_id: str):
        self.client_id = client_id
        saved = credentials.load(*KEY)
        self.tokens: dict = json.loads(saved.password) if saved and saved.password else {}

    @property
    def logged_in(self) -> bool:
        return bool(self.tokens.get("refresh_token") or self.tokens.get("access_token"))

    def _store(self) -> None:
        credentials.save(*KEY, credentials.Login("globus", json.dumps(self.tokens)))

    def logout(self) -> None:
        self.tokens = {}
        credentials.clear(*KEY)

    def finish_login(self, code: str, verifier: str) -> None:
        resp = _http("POST", f"{AUTH}/token", form={
            "grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT,
            "client_id": self.client_id, "code_verifier": verifier})
        self.tokens = transfer_tokens(resp)
        self._store()

    def _token(self) -> str:
        if not self.logged_in:
            raise GlobusError("Sign in to Globus first")
        if time.time() > self.tokens.get("expires_at", 0) and self.tokens.get("refresh_token"):
            resp = _http("POST", f"{AUTH}/token", form={
                "grant_type": "refresh_token", "refresh_token": self.tokens["refresh_token"],
                "client_id": self.client_id})
            fresh = transfer_tokens(resp)
            fresh["refresh_token"] = fresh["refresh_token"] or self.tokens["refresh_token"]
            self.tokens = fresh
            self._store()
        return self.tokens["access_token"]

    def search(self, text: str) -> list[Collection]:
        q = urllib.parse.urlencode({"filter_fulltext": text, "limit": 25})
        resp = _http("GET", f"{TRANSFER}/endpoint_search?{q}", self._token())
        return [Collection(d["id"], d.get("display_name") or d.get("canonical_name") or d["id"],
                           d.get("owner_string", "")) for d in resp.get("DATA", [])]

    def submit(self, src: str, src_path: str, dst: str, dst_path: str, label: str, recursive: bool,
               sync_level: int | None = None, skip: list[str] | None = None) -> str:
        """sync_level 2: only files that are new or newer there. skip: folder names left out (at any depth)."""
        token = self._token()
        sid = _http("GET", f"{TRANSFER}/submission_id", token)["value"]
        body = {"DATA_TYPE": "transfer", "submission_id": sid, "source_endpoint": src,
                "destination_endpoint": dst, "label": label[:128], "sync_level": sync_level,
                "DATA": [{"DATA_TYPE": "transfer_item", "source_path": src_path,
                          "destination_path": dst_path, "recursive": recursive}]}
        if skip:
            body["filter_rules"] = [{"DATA_TYPE": "filter_rule", "method": "exclude", "type": "dir", "name": n}
                                    for n in skip]
        return _http("POST", f"{TRANSFER}/transfer", token, body=body)["task_id"]

    def ls(self, collection: str, path: str) -> tuple[str, list[Item]]:
        q = urllib.parse.urlencode({"path": path or "/~/"})
        return parse_ls(_http("GET", f"{TRANSFER}/operation/endpoint/{collection}/ls?{q}", self._token()))

    def mkdir(self, collection: str, path: str) -> None:
        _http("POST", f"{TRANSFER}/operation/endpoint/{collection}/mkdir", self._token(),
              body={"DATA_TYPE": "mkdir", "path": path})

    def tasks(self, limit: int = 20) -> list[dict]:
        q = urllib.parse.urlencode({"limit": limit, "orderby": "request_time desc", "filter": "type:TRANSFER"})
        return _http("GET", f"{TRANSFER}/task_list?{q}", self._token()).get("DATA", [])

    def cancel(self, task_id: str) -> None:
        _http("POST", f"{TRANSFER}/task/{urllib.parse.quote(task_id)}/cancel", self._token(), body={})
