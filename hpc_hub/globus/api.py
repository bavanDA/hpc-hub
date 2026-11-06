"""Globus over its REST API (no SDK): collections, folders and transfers. Tokens live in the keyring."""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from ..core import credentials
from .signin import AUTH, REDIRECT

TRANSFER = "https://transfer.api.globus.org/v0.10"
KEY = ("globus", "tokens")


class GlobusError(Exception):
    pass


class NeedsSignIn(GlobusError):
    """A collection wants more than the plain sign-in."""


class ConsentRequired(NeedsSignIn):
    def __init__(self, scopes: list[str]):
        super().__init__("Globus needs extra permission for this collection")
        self.scopes = scopes


class SessionRequired(NeedsSignIn):
    """The collection only lets in accounts from these domains (Yale: yale.edu)."""

    def __init__(self, domains: list[str]):
        super().__init__(f"Sign in with your {' or '.join(domains)} account")
        self.domains = domains


@dataclass
class Collection:
    id: str
    name: str
    owner: str
    kind: str = ""  # Globus entity_type
    working: bool = True
    managed: bool = False  # under an institution's Globus subscription
    contact: str = ""
    mine: bool = False  # one of your own (Globus Connect Personal)


# Collections that hold a cluster's files for everyone with an account there. Not: servers (GCSv5_endpoint),
# someone's shared folder (guest collections).
CLUSTER_KINDS = {"GCSv5_mapped_collection", "GCP_mapped_collection", "GCSv4_host"}
PICKABLE_KINDS = CLUSTER_KINDS | {"GCSv5_guest_collection", "GCSv4_share", "GCP_guest_collection"}
GENERIC_WORDS = {"login", "hpc", "cluster", "ssh", "www", "edu", "org", "com", "net", "ac", "uk"}


def _collection(d: dict, mine: bool = False) -> Collection:
    return Collection(d["id"], d.get("display_name") or d.get("canonical_name") or d["id"], d.get("owner_string") or "",
                      d.get("entity_type") or "", not d.get("non_functional"), bool(d.get("subscription_id")),
                      d.get("contact_email") or "", mine)


def cluster_words(name: str, host: str) -> tuple[list[str], str]:
    """Words that name the cluster (expanse, bouchet, wulver) and its site's domain (sdsc.edu)."""
    labels = host.lower().split(".")
    domain = ".".join(labels[-2:]) if len(labels) > 1 else ""
    words = re.findall(r"[a-z0-9]+", f"{name} {host}".lower())
    skip = GENERIC_WORDS | set(domain.split("."))
    return list(dict.fromkeys(w for w in words if len(w) > 2 and w not in skip)), domain


def score(c: Collection, words: list[str], domain: str) -> int:
    """Higher is more likely the cluster's own collection."""
    name = c.name.lower()
    at_site = bool(domain) and any(e.lower().endswith(("@" + domain, "." + domain)) for e in (c.owner, c.contact))
    return (2 * any(w in name for w in words) + 3 * c.managed + 2 * at_site + 3 * c.mine
            - 3 * ("test" in name) - (c.kind == "GCP_mapped_collection") - 2 * (c.kind not in CLUSTER_KINDS))


def ranked(found: list[Collection], words: list[str], domain: str) -> list[Collection]:
    """Pickable collections, best first."""
    ok = {c.id: c for c in found if c.working and c.kind in PICKABLE_KINDS}
    return sorted(ok.values(), key=lambda c: -score(c, words, domain))


def best(found: list[Collection], words: list[str], domain: str) -> Collection | None:
    """The cluster's own collection when one is clearly it, else None (then you pick)."""
    top = [c for c in ranked(found, words, domain) if c.kind in CLUSTER_KINDS]
    return top[0] if top and score(top[0], words, domain) >= 5 else None


@dataclass
class Item:
    name: str
    is_dir: bool
    size: int
    modified: str


@dataclass
class TaskInfo:
    """Where a Globus transfer is at."""
    status: str  # ACTIVE, INACTIVE (paused), SUCCEEDED, FAILED
    bytes: int
    files_done: int
    files: int  # 0 while Globus is still counting
    rate: float  # bytes a second
    problem: str  # Globus' word for what holds it up (PERMISSION_DENIED...), "" when fine
    cancelled: bool = False

    @property
    def finished(self) -> bool:
        return self.status in ("SUCCEEDED", "FAILED")


def task_info(t: dict) -> TaskInfo:
    nice = t.get("nice_status") or ""
    return TaskInfo(t.get("status", ""), int(t.get("bytes_transferred") or 0),
                    int(t.get("files_transferred") or 0) + int(t.get("files_skipped") or 0), int(t.get("files") or 0),
                    float(t.get("effective_bytes_per_second") or 0),
                    "" if nice in ("", "OK", "Queued", "SUCCEEDED") else nice,
                    (t.get("fatal_error") or {}).get("code") == "CANCELED")


def collection_path(real: str, top: set[str]) -> str:
    """A path on the cluster as the collection names it. Some collections start lower down: Expanse's starts at
    /expanse/lustre, so /expanse/lustre/scratch/you is /scratch/you there. top: names at the collection's /."""
    parts = [x for x in real.split("/") if x]
    for k in range(len(parts)):
        if parts[k] in top:
            return "/" + "/".join(parts[k:]) + ("/" if real.endswith("/") and len(parts) > k else "")
    raise GlobusError(f"{real} is not in this Globus collection. It only has {', '.join(sorted(top))}. "
                      "Pick a folder in one of those")


def parse_ls(resp: dict) -> tuple[str, list[Item]]:
    """(absolute path, folders first then files) from an ls response."""
    items = [Item(d["name"], d.get("type") == "dir", int(d.get("size") or 0), (d.get("last_modified") or "")[:16])
             for d in resp.get("DATA", [])]
    items.sort(key=lambda i: (not i.is_dir, i.name.lower()))
    return resp.get("path", ""), items


def session_domains(err: dict, text: str) -> list[str]:
    """Domains a collection wants you signed in from; also when buried in a GridFTP message."""
    found = (err.get("authorization_parameters") or {}).get("session_required_single_domain")
    if found:
        return list(found)
    m = re.search(r'"session_required_single_domain":\s*\[([^\]]*)\]', text)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


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
        message = err.get("message") or err.get("error_description") or f"HTTP {e.code}"
        if domains := session_domains(err, message):
            raise SessionRequired(domains) from e
        raise GlobusError(message) from e
    except urllib.error.URLError as e:
        raise GlobusError(f"Cannot reach Globus: {e.reason}") from e


def transfer_tokens(resp: dict) -> dict:
    """Pick the transfer.api.globus.org token out of a token response."""
    for t in [resp, *resp.get("other_tokens", [])]:
        if t.get("resource_server") == "transfer.api.globus.org":
            return {"access_token": t["access_token"], "refresh_token": t.get("refresh_token", ""),
                    "expires_at": time.time() + int(t.get("expires_in", 0)) - 60}
    raise GlobusError("Globus did not return a transfer token")


def check_collections(client: "Globus", clusters) -> dict[str, Collection | None]:
    """Each cluster's collection, found when missing or when the saved one is not a working collection.
    Returns only the clusters whose collection should change (None: none found, you pick)."""
    out = {}
    for c in clusters:
        if c.globus.collection_id:
            try:
                saved = client.collection(c.globus.collection_id)
                if saved.working and saved.kind in PICKABLE_KINDS:
                    continue
            except GlobusError:
                continue  # can't tell (offline, no permission yet): keep it
        found = client.find_for(c.name, c.host)
        if found or c.globus.collection_id:
            out[c.id] = found
    return out


class Globus:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self._tops: dict[str, set[str]] = {}  # collection id: names at its /
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

    def search(self, text: str, mine: bool = False) -> list[Collection]:
        q = urllib.parse.urlencode({"filter_fulltext": text, "limit": 50,
                                    **({"filter_scope": "my-endpoints"} if mine else {})})
        resp = _http("GET", f"{TRANSFER}/endpoint_search?{q}", self._token())
        return [_collection(d, mine) for d in resp.get("DATA", [])]

    def collection(self, collection_id: str) -> Collection:
        return _collection(_http("GET", f"{TRANSFER}/endpoint/{collection_id}", self._token()))

    def candidates(self, name: str, host: str) -> list[Collection]:
        """Everything Globus knows that could be this cluster's, best first; yours count as yours."""
        words, domain = cluster_words(name, host)
        found: dict[str, Collection] = {}
        for w in words:
            for c in self.search(w) + self.search(w, mine=True):
                found[c.id] = c if c.mine or c.id not in found else found[c.id]
        return ranked(list(found.values()), words, domain)

    def find_for(self, name: str, host: str) -> Collection | None:
        return best(self.candidates(name, host), *cluster_words(name, host))

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

    def path_for(self, collection: str, real: str) -> str:
        """The collection's name for a path on the cluster (see collection_path)."""
        if collection not in self._tops:
            self._tops[collection] = {i.name for i in self.ls(collection, "/")[1]}
        return collection_path(real, self._tops[collection])

    def needs(self, collection: str) -> NeedsSignIn | None:
        """What this collection wants before it lists files: a permission, an account from its domain, or nothing."""
        try:
            self.ls(collection, "")
        except NeedsSignIn as e:
            return e
        except GlobusError:
            pass  # other trouble (offline Globus Connect) shows in its pane
        return None

    def mkdir(self, collection: str, path: str) -> None:
        _http("POST", f"{TRANSFER}/operation/endpoint/{collection}/mkdir", self._token(),
              body={"DATA_TYPE": "mkdir", "path": path})

    def tasks(self, limit: int = 20) -> list[dict]:
        q = urllib.parse.urlencode({"limit": limit, "orderby": "request_time desc", "filter": "type:TRANSFER"})
        return _http("GET", f"{TRANSFER}/task_list?{q}", self._token()).get("DATA", [])

    def task(self, task_id: str) -> TaskInfo:
        return task_info(_http("GET", f"{TRANSFER}/task/{urllib.parse.quote(task_id)}", self._token()))

    def cancel(self, task_id: str) -> None:
        _http("POST", f"{TRANSFER}/task/{urllib.parse.quote(task_id)}/cancel", self._token())
