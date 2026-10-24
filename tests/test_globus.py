import base64
import hashlib
import urllib.parse

import pytest

from hpc_hub import globus


def test_pkce_and_url():
    verifier, challenge = globus.pkce()
    expect = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == expect
    url = globus.authorize_url("cid", challenge)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert q["client_id"] == ["cid"] and q["code_challenge_method"] == ["S256"]
    assert q["scope"] == [globus.TRANSFER_SCOPE] and q["access_type"] == ["offline"]


def test_pasted_code():
    code = "Ab3dE5fG7hJ9kL1mN3pQ5rS7tV9xZ1"
    assert globus.pasted_code(f"  {code}\n") == code
    assert globus.pasted_code(globus.REDIRECT + "?code=" + code) == code
    assert globus.pasted_code("https://evil.example/?code=x") == "" and globus.pasted_code("two words") == ""
    assert globus.looks_like_code(code) and not globus.looks_like_code("hello")


def test_code_from_url():
    assert globus.code_from_url(globus.REDIRECT + "?code=abc&state=x") == "abc"
    assert globus.code_from_url("https://evil.example/?code=abc") == ""


def test_data_access_scope():
    s = globus.data_access_scope(["c1", ""])
    assert s == globus.TRANSFER_SCOPE + "[*https://auth.globus.org/scopes/c1/data_access]"


def test_transfer_tokens():
    resp = {"resource_server": "auth.globus.org", "access_token": "a",
            "other_tokens": [{"resource_server": "transfer.api.globus.org", "access_token": "t",
                              "refresh_token": "r", "expires_in": 3600}]}
    tok = globus.transfer_tokens(resp)
    assert tok["access_token"] == "t" and tok["refresh_token"] == "r"
    with pytest.raises(globus.GlobusError):
        globus.transfer_tokens({"resource_server": "auth.globus.org", "access_token": "a"})


def test_parse_ls():
    resp = {"path": "/home/bd/", "DATA": [
        {"name": "b.txt", "type": "file", "size": 5, "last_modified": "2026-10-18 12:30:00+00:00"},
        {"name": "Zed", "type": "dir", "size": 4096, "last_modified": "2026-10-17 09:00:00+00:00"},
        {"name": "a", "type": "dir"}]}
    path, items = globus.parse_ls(resp)
    assert path == "/home/bd/"
    assert [i.name for i in items] == ["a", "Zed", "b.txt"]
    assert items[2].size == 5 and not items[2].is_dir and items[2].modified == "2026-10-18 12:30"
