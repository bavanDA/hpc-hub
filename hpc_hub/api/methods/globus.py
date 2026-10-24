"""Globus: sign-in, each cluster's collection, browsing, transfers. Tokens stay in the keyring; the PKCE verifier
of a sign-in in progress stays here, the UI only gets an id for it."""

import posixpath
import secrets
import threading
import time

from ...core import config
from ...files import remote_fs
from ...globus import api as globus
from ..hub import hub
from ..server import method

LOGIN_SECONDS = 1800
ACTIVE = ("ACTIVE", "INACTIVE")

_lock = threading.Lock()
_client: globus.Globus | None = None
_logins: dict[str, tuple[str, float]] = {}  # login id: (PKCE verifier, when it started)
_wants: dict[str, globus.NeedsSignIn] = {}  # cluster id: what its collection wants before it lists files
_checked: set[str] = set()  # client ids whose collections were checked this run


def _app() -> config.AppSettings:
    return config.load_app(config.APP_FILE)


def client() -> globus.Globus:
    """The Globus client for the saved client id, kept while the id stays the same."""
    global _client
    cid = _app().globus_client_id
    if not cid:
        raise globus.GlobusError("Set up Globus first")
    with _lock:
        if _client is None or _client.client_id != cid:
            _client = globus.Globus(cid)
        return _client


def _cluster(cid: str) -> config.ClusterConfig:
    for c in hub().clusters:
        if c.id == cid:
            return c
    raise ValueError(f"No cluster {cid}")


def _collection_of(cid: str) -> str:
    c = _cluster(cid)
    if not c.globus.collection_id:
        raise globus.GlobusError(f"Pick a Globus collection for {c.name} first")
    return c.globus.collection_id


def _want_json(cid: str, w: globus.NeedsSignIn) -> dict:
    c = _cluster(cid)
    domains = w.domains if isinstance(w, globus.SessionRequired) else []
    return {"cluster": cid, "name": c.name, "collection": c.globus.collection_name,
            "kind": "domain" if domains else "consent", "domains": domains, "message": str(w)}


def _status(signed_in: bool | None = None) -> dict:
    cid = _app().globus_client_id
    if signed_in is None:
        signed_in = bool(cid) and client().logged_in
    return {"client_id": cid, "signed_in": signed_in,
            "clusters": [{"id": c.id, "name": c.name, "collection_id": c.globus.collection_id,
                          "collection_name": c.globus.collection_name} for c in hub().clusters],
            "wants": [_want_json(k, w) for k, w in list(_wants.items())]}


@method("globus.status")
def status() -> dict:
    """Client id, signed in or not, each cluster's collection, and what collections want first."""
    return _status()


@method("globus.set_client")
def set_client(id: str) -> dict:
    app = _app()
    app.globus_client_id = id.strip()
    config.save_app(app, config.APP_FILE)
    _wants.clear()
    return _status()


def _start_login(scope: str, fresh: bool, domain: str = "", what: str = "") -> dict:
    now = time.time()
    for k in [k for k, (_v, t) in list(_logins.items()) if now - t > LOGIN_SECONDS]:
        _logins.pop(k, None)
    verifier, challenge = globus.pkce()
    lid = secrets.token_hex(8)
    _logins[lid] = (verifier, now)
    return {"id": lid, "url": globus.authorize_url(client().client_id, challenge, scope, fresh, domain),
            "fresh": fresh, "domain": domain, "what": what}


@method("globus.login_url")
def login_url() -> dict:
    """A fresh sign-in page for the plain transfer permission."""
    return _start_login(globus.TRANSFER_SCOPE, True)


@method("globus.consent_url")
def consent_url() -> dict:
    """One page for every collection's wishes: the permissions merged, and an account from a domain if one asks.
    Already signed in: only Allow, unless a domain wants its account."""
    wants = list(_wants.items())  # panes add to it from other threads
    domain = next((w.domains[0] for _k, w in wants if isinstance(w, globus.SessionRequired)), "")
    kind = globus.SessionRequired if domain else globus.ConsentRequired
    names = [_cluster(k).name for k, w in wants if isinstance(w, kind)]
    scope = globus.merge_scopes([s for _k, w in wants if isinstance(w, globus.ConsentRequired)
                                 for s in w.scopes])
    return _start_login(scope, not client().logged_in, domain, " and ".join(names))


@method("globus.finish_login")
def finish_login(login_id: str, code: str) -> dict:
    """code: what Globus showed, or the whole page address it was on."""
    if login_id not in _logins:
        raise globus.GlobusError("This sign-in expired. Open the Globus page again")
    clean = globus.pasted_code(code)
    if not clean:
        raise globus.GlobusError("That does not look like a Globus code")
    try:
        client().finish_login(clean, _logins[login_id][0])
    except globus.GlobusError as e:
        raise globus.GlobusError(f"Globus did not accept it: {e}. Codes work once; open the page again for a "
                                 "new one") from e
    _logins.pop(login_id, None)
    _wants.clear()  # check() asks again; anything left (a second domain) shows again
    return _status(True)


@method("globus.logout")
def logout() -> dict:
    client().logout()
    _wants.clear()
    return _status(False)


def _use(c: config.ClusterConfig, found: globus.Collection | None) -> None:
    c.globus.collection_id, c.globus.collection_name = (found.id, found.name) if found else ("", "")


@method("globus.check")
def check() -> dict:
    """Find missing collections (once a run), then ask each what it wants before it lists files.
    changes: clusters whose collection changed, for a message (collection "" when none was found)."""
    g = client()
    changes = []
    if g.client_id not in _checked:
        found = globus.check_collections(g, hub().clusters)
        _checked.add(g.client_id)
        for c in hub().clusters:
            if c.id in found:
                old = c.globus.collection_id
                _use(c, found[c.id])
                if not (found[c.id] and found[c.id].id == old):
                    changes.append({"cluster": c.id, "name": c.name, "collection": c.globus.collection_name})
        if found:
            hub().save_clusters()
    for c in hub().clusters:
        if c.globus.collection_id:
            w = g.needs(c.globus.collection_id)
            if w:
                _wants[c.id] = w
            else:
                _wants.pop(c.id, None)
    return {"changes": changes, **_status(True)}


@method("globus.collections")
def collections(cluster: str, query: str = "") -> dict:
    """Collections matching query (default: the cluster's own name), best first; best marks the clear match."""
    c, g = _cluster(cluster), client()
    words, domain = globus.cluster_words(c.name, c.host)
    query = query.strip() or (words or [c.name])[0]
    found = g.search(query) + g.search(query, mine=True)
    top = globus.best(found, words, domain)
    best_id = top.id if top else ""
    return {"query": query, "results": [
        {"id": x.id, "name": x.name, "owner": x.owner, "kind": x.kind, "mine": x.mine, "best": x.id == best_id}
        for x in globus.ranked(found, words, domain)]}


@method("globus.set_collection")
def set_collection(cluster: str, id: str, name: str = "") -> dict:
    c = _cluster(cluster)
    c.globus.collection_id = id
    c.globus.collection_name = name or (client().collection(id).name if id else "")
    hub().save_clusters()
    _wants.pop(cluster, None)
    return _status()


@method("globus.ls")
def ls(cluster: str, path: str = "") -> dict:
    """A folder of the cluster's collection. state: ok, none (no collection), consent or domain (sign-in wanted),
    offline (Globus Connect Personal is not running there)."""
    c = _cluster(cluster)
    base = {"cluster": cluster, "collection": c.globus.collection_name, "path": path, "items": []}
    if not c.globus.collection_id:
        return {**base, "state": "none"}
    try:
        target, items = client().ls(c.globus.collection_id, path)
    except globus.NeedsSignIn as e:
        _wants[cluster] = e
        return {**base, "state": "domain" if isinstance(e, globus.SessionRequired) else "consent",
                "want": _want_json(cluster, e)}
    except globus.GlobusError as e:
        if globus.personal_offline(str(e)):
            return {**base, "state": "offline"}
        raise
    return {**base, "state": "ok", "path": target,
            "items": [{"name": i.name, "is_dir": i.is_dir, "size": i.size, "modified": i.modified} for i in items]}


@method("globus.mkdir")
def mkdir(cluster: str, path: str) -> None:
    client().mkdir(_collection_of(cluster), path)


@method("globus.transfer")
def transfer(src_cluster: str, src_path: str, dst_cluster: str, dst_path: str, recursive: bool = False) -> dict:
    """Hand a copy to Globus; it runs there, so the app or laptop may close."""
    src, dst = _collection_of(src_cluster), _collection_of(dst_cluster)
    name = posixpath.basename(src_path.rstrip("/")) or src_path
    return {"task_id": client().submit(src, src_path, dst, dst_path, f"HPC Hub {name}", recursive)}


def _task_json(t: dict) -> dict:
    info = globus.task_info(t)
    return {"task_id": t.get("task_id", ""), "label": t.get("label") or t.get("task_id", ""),
            "status": info.status, "nice_status": t.get("nice_status") or "", "problem": info.problem,
            "source": t.get("source_endpoint_display_name") or "?",
            "destination": t.get("destination_endpoint_display_name") or "?",
            "bytes": info.bytes, "files_done": info.files_done, "files": info.files, "rate": info.rate,
            "request_time": (t.get("request_time") or "")[:16].replace("T", " "),
            "active": info.status in ACTIVE, "cancelled": info.cancelled}


@method("globus.tasks")
def tasks() -> list[dict]:
    """Recent transfers, newest first."""
    return [_task_json(t) for t in client().tasks()]


@method("globus.cancel")
def cancel(task_id: str) -> None:
    client().cancel(task_id)


@method("globus.start_personal")
def start_personal(cluster: str) -> None:
    """Your own collection (Wulver): start Globus Connect Personal on the login node, sharing your storage."""
    s = hub().connected(cluster)
    folders = [p.path for p in remote_fs.storage(remote_fs.places(s.ssh)) if p.label != "Home"]
    res = s.ssh.run(globus.personal_start(folders), timeout=90)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Could not start it")
