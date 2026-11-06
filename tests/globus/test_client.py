import io
import json
import time
import urllib.error

import pytest

from hpc_hub.globus import api as globus


@pytest.fixture
def calls(monkeypatch):
    """The keyring in a dict; every HTTP call recorded and answered from `answers` by URL piece."""
    saved = {}
    monkeypatch.setattr(globus.credentials, "load", lambda *k: saved.get(k))
    monkeypatch.setattr(globus.credentials, "save", lambda *a: saved.__setitem__(a[:2], a[2]))
    monkeypatch.setattr(globus.credentials, "clear", lambda *k: saved.pop(k, None))
    log, answers = [], {}

    def http(method, url, token="", body=None, form=None):
        log.append((method, url, token, body, form))
        return next(v for k, v in answers.items() if k in url)
    monkeypatch.setattr(globus, "_http", http)
    return log, answers


def _signed_in(answers, expires_in=3600):
    answers["/token"] = {"resource_server": "transfer.api.globus.org", "access_token": "a1", "refresh_token": "r1",
                         "expires_in": expires_in}
    g = globus.Globus("cid")
    g.finish_login("code", "verifier")
    return g


def test_sign_in_keeps_tokens_and_sign_out_drops_them(calls):
    log, answers = calls
    assert not globus.Globus("cid").logged_in
    g = _signed_in(answers)
    assert log[0][4]["code_verifier"] == "verifier" and globus.Globus("cid").logged_in
    g.logout()
    assert not globus.Globus("cid").logged_in
    with pytest.raises(globus.GlobusError, match="Sign in"):
        g.tasks()


def test_an_old_token_is_refreshed_first(calls):
    log, answers = calls
    g = _signed_in(answers, expires_in=0)
    answers["/token"] = {"resource_server": "transfer.api.globus.org", "access_token": "a2", "expires_in": 3600}
    answers["task_list"] = {"DATA": [{"task_id": "t1"}]}
    assert g.tasks() == [{"task_id": "t1"}]
    assert log[-2][4]["grant_type"] == "refresh_token" and log[-1][2] == "a2"
    assert g.tokens["refresh_token"] == "r1" and g.tokens["expires_at"] > time.time()


def test_submit_leaves_out_skipped_folders(calls):
    log, answers = calls
    g = _signed_in(answers)
    answers["submission_id"] = {"value": "sub1"}
    answers["/transfer"] = {"task_id": "task1"}
    assert g.submit("a", "/x", "b", "/y", "x" * 200, True, sync_level=2, skip=["data"]) == "task1"
    body = log[-1][3]
    assert body["submission_id"] == "sub1" and len(body["label"]) == 128 and body["sync_level"] == 2
    assert body["filter_rules"] == [{"DATA_TYPE": "filter_rule", "method": "exclude", "type": "dir", "name": "data"}]


def test_path_for_asks_the_collection_its_top_once(calls):
    log, answers = calls
    g = _signed_in(answers)
    answers["/ls"] = {"path": "/", "DATA": [{"name": "scratch", "type": "dir"}, {"name": "projects", "type": "dir"}]}
    assert g.path_for("c", "/expanse/lustre/scratch/jdoe") == "/scratch/jdoe"
    assert g.path_for("c", "/expanse/lustre/projects/abc123/jdoe/") == "/projects/abc123/jdoe/"
    assert len([c for c in log if "/ls" in c[1]]) == 1


def test_needs_tells_permission_from_other_trouble(calls, monkeypatch):
    g = _signed_in(calls[1])
    errors = iter([globus.ConsentRequired(["s"]), globus.GlobusError("offline"), None])

    def ls(collection, path):
        e = next(errors)
        if e:
            raise e
        return "/", []
    monkeypatch.setattr(g, "ls", ls)
    assert isinstance(g.needs("c"), globus.ConsentRequired)
    assert g.needs("c") is None and g.needs("c") is None


def _http_error(monkeypatch, status, body):
    def urlopen(req, timeout):
        raise urllib.error.HTTPError(req.full_url, status, "no", {}, io.BytesIO(json.dumps(body).encode()))
    monkeypatch.setattr(globus.urllib.request, "urlopen", urlopen)


def test_http_errors_say_what_globus_wants(monkeypatch):
    _http_error(monkeypatch, 403, {"code": "ConsentRequired", "required_scopes": ["s1"]})
    with pytest.raises(globus.ConsentRequired) as e:
        globus._http("GET", "https://x")
    assert e.value.scopes == ["s1"]
    _http_error(monkeypatch, 403, {"message": "no", "authorization_parameters":
                                   {"session_required_single_domain": ["uni.edu"]}})
    with pytest.raises(globus.SessionRequired, match="uni.edu"):
        globus._http("GET", "https://x")
    _http_error(monkeypatch, 404, {})
    with pytest.raises(globus.GlobusError, match="HTTP 404"):
        globus._http("GET", "https://x")

    def offline(req, timeout):
        raise urllib.error.URLError("no network")
    monkeypatch.setattr(globus.urllib.request, "urlopen", offline)
    with pytest.raises(globus.GlobusError, match="Cannot reach Globus"):
        globus._http("POST", "https://x", token="t", form={"a": "b"})
