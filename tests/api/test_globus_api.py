import urllib.parse

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import globus as m
from hpc_hub.core import config
from hpc_hub.core.config import ClusterConfig
from hpc_hub.globus import api as globus

CODE = "Ab3dE5fG7hJ9kL1mN3pQ5rS7tV9xZ1"
SCOPE = globus.TRANSFER_SCOPE + "[*https://auth.globus.org/scopes/c2/data_access]"


class FakeGlobus:
    """Stands in for the Globus client: no network, no keyring."""

    def __init__(self, client_id):
        self.client_id = client_id
        self.tokens = {}
        self.submitted, self.cancelled, self.made = [], [], []
        self.collections = {"c1": globus.Collection("c1", "Wulver home", "admin@njit.edu", "GCSv5_mapped_collection",
                                                    managed=True),
                            "c2": globus.Collection("c2", "Expanse", "admin@sdsc.edu", "GCSv5_mapped_collection",
                                                    managed=True)}

    @property
    def logged_in(self):
        return bool(self.tokens)

    def finish_login(self, code, verifier):
        if code != CODE or not verifier:
            raise globus.GlobusError("invalid_grant")
        self.tokens = {"access_token": "t"}

    def logout(self):
        self.tokens = {}

    def collection(self, cid):
        return self.collections[cid]

    def find_for(self, name, host):
        return self.collections["c2"] if "expanse" in host else None

    def search(self, text, mine=False):
        found = [globus.Collection("c2", "Expanse", "admin@sdsc.edu", "GCSv5_mapped_collection", managed=True),
                 globus.Collection("c3", "Expanse test", "jdoe@gmail.com", "GCSv5_mapped_collection")]
        return [] if mine else found

    def needs(self, cid):
        return globus.ConsentRequired([SCOPE]) if cid == "c2" else None

    def ls(self, cid, path):
        if cid == "c2":
            raise globus.ConsentRequired([SCOPE])
        if cid == "gcp":
            raise globus.GlobusError("Globus Connect Personal endpoint is not currently connected to Globus")
        return "/home/jdoe/", [globus.Item("data", True, 0, "2026-01-02 10:00"),
                               globus.Item("a.txt", False, 12, "2026-01-02 10:00")]

    def mkdir(self, cid, path):
        self.made.append((cid, path))

    def submit(self, *args):
        self.submitted.append(args)
        return "task-1"

    def tasks(self):
        return [{"task_id": "task-1", "label": "HPC Hub data", "status": "ACTIVE", "nice_status": "OK",
                 "bytes_transferred": 2048, "files": 4, "files_transferred": 1, "files_skipped": 1,
                 "request_time": "2026-01-02T10:00:00+00:00", "source_endpoint_display_name": "Wulver home",
                 "destination_endpoint_display_name": "Expanse"}]

    def cancel(self, task_id):
        self.cancelled.append(task_id)


class FakeHub:
    def __init__(self):
        self.clusters = [ClusterConfig("wulver", "Wulver", host="wulver.njit.edu"),
                         ClusterConfig("sdsc", "SDSC Expanse", host="login.expanse.sdsc.edu")]
        self.clusters[0].globus.collection_id, self.clusters[0].globus.collection_name = "c1", "Wulver home"
        self.saved = 0

    def save_clusters(self):
        self.saved += 1

    def connected(self, cluster):
        raise RuntimeError("Connect to it first")


@pytest.fixture
def h(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "app.toml")
    monkeypatch.setattr(globus, "Globus", FakeGlobus)
    fake = FakeHub()
    monkeypatch.setattr(hub_mod, "_hub", fake)
    monkeypatch.setattr(m, "_client", None)
    for state in (m._logins, m._wants, m._checked):
        state.clear()
    return fake


def signed_in():
    m.set_client("abc123")
    m.client().tokens = {"access_token": "t"}


def test_setup_and_sign_in(h, tmp_path):
    assert m.status()["client_id"] == "" and not m.status()["signed_in"]
    with pytest.raises(globus.GlobusError):
        m.login_url()
    assert m.set_client(" abc123 ")["client_id"] == "abc123"
    assert "abc123" in (tmp_path / "app.toml").read_text()
    login = m.login_url()
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(login["url"]).query)
    assert q["client_id"] == ["abc123"] and q["prompt"] == ["login"] and login["fresh"]
    assert "verifier" not in str(login)  # the verifier never leaves the backend
    with pytest.raises(globus.GlobusError, match="does not look like"):
        m.finish_login(login["id"], "two words")
    with pytest.raises(globus.GlobusError, match="expired"):
        m.finish_login("nope", CODE)
    assert m.finish_login(login["id"], globus.REDIRECT + "?code=" + CODE)["signed_in"]  # the page address works
    assert login["id"] not in m._logins
    assert not m.logout()["signed_in"]


def test_check_finds_collections_and_what_they_want(h):
    signed_in()
    got = m.check()
    assert got["changes"] == [{"cluster": "sdsc", "name": "SDSC Expanse", "collection": "Expanse"}]
    assert h.clusters[1].globus.collection_id == "c2" and h.saved == 1
    assert got["wants"] == [{"cluster": "sdsc", "name": "SDSC Expanse", "collection": "Expanse", "kind": "consent",
                             "domains": [], "message": "Globus needs extra permission for this collection"}]
    assert m.check()["changes"] == []  # once a run
    consent = m.consent_url()
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(consent["url"]).query)
    assert q["scope"] == [SCOPE] and "prompt" not in q and not consent["fresh"]  # signed in: only Allow
    assert consent["what"] == "SDSC Expanse"


def test_domain_sign_in(h):
    signed_in()
    m._wants["wulver"] = globus.SessionRequired(["njit.edu"])
    consent = m.consent_url()
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(consent["url"]).query)
    assert q["session_required_single_domain"] == ["njit.edu"] and consent["domain"] == "njit.edu"
    assert m.status()["wants"][0]["kind"] == "domain"


def test_collections_are_ranked(h):
    signed_in()
    got = m.collections("sdsc")
    assert got["query"] == "expanse"
    assert [(r["id"], r["best"]) for r in got["results"]] == [("c2", True), ("c3", False)]
    m.set_collection("sdsc", "c3", "Expanse test")
    assert h.clusters[1].globus.collection_name == "Expanse test" and h.saved == 1
    m.set_collection("sdsc", "c1")  # no name: asks Globus
    assert h.clusters[1].globus.collection_name == "Wulver home"


def test_ls_states(h):
    signed_in()
    ok = m.ls("wulver", "")
    assert ok["state"] == "ok" and ok["path"] == "/home/jdoe/" and ok["items"][0] == {
        "name": "data", "is_dir": True, "size": 0, "modified": "2026-01-02 10:00"}
    assert m.ls("sdsc")["state"] == "none"
    h.clusters[1].globus.collection_id = "c2"
    assert m.ls("sdsc")["state"] == "consent" and "sdsc" in m._wants
    h.clusters[1].globus.collection_id = "gcp"
    assert m.ls("sdsc")["state"] == "offline"


def test_transfer_tasks_cancel(h):
    signed_in()
    h.clusters[1].globus.collection_id = "c2"
    assert m.transfer("wulver", "/home/jdoe/data", "sdsc", "/expanse/jdoe/data", True) == {"task_id": "task-1"}
    assert m.client().submitted == [("c1", "/home/jdoe/data", "c2", "/expanse/jdoe/data", "HPC Hub data", True)]
    t = m.tasks()[0]
    assert t["active"] and t["files_done"] == 2 and t["files"] == 4 and t["request_time"] == "2026-01-02 10:00"
    m.cancel("task-1")
    m.mkdir("wulver", "/home/jdoe/new")
    assert m.client().cancelled == ["task-1"] and m.client().made == [("c1", "/home/jdoe/new")]
    h.clusters[1].globus.collection_id = ""
    with pytest.raises(globus.GlobusError, match="Pick a Globus collection"):
        m.transfer("wulver", "/a", "sdsc", "/b")


def test_start_personal_needs_a_connection(h):
    with pytest.raises(RuntimeError, match="Connect"):
        m.start_personal("wulver")
