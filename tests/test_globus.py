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
