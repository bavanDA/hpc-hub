import base64
import hashlib
import urllib.parse

from hpc_hub.globus import signin


def test_pkce_and_url():
    verifier, challenge = signin.pkce()
    expect = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == expect
    url = signin.authorize_url("cid", challenge)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert q["client_id"] == ["cid"] and q["code_challenge_method"] == ["S256"]
    assert q["scope"] == [signin.TRANSFER_SCOPE] and q["access_type"] == ["offline"]
    assert q["prompt"] == ["login"]
    assert "prompt=" not in signin.authorize_url("cid", challenge, fresh=False)  # only Allow, no new login


def test_pasted_code():
    code = "Ab3dE5fG7hJ9kL1mN3pQ5rS7tV9xZ1"
    assert signin.pasted_code(f"  {code}\n") == code
    assert signin.pasted_code(signin.REDIRECT + "?code=" + code) == code
    assert signin.pasted_code("https://evil.example/?code=x") == "" and signin.pasted_code("two words") == ""


def test_code_from_url():
    assert signin.code_from_url(signin.REDIRECT + "?code=abc&state=x") == "abc"
    assert signin.code_from_url("https://evil.example/?code=abc") == ""


def test_merge_scopes():
    one = signin.TRANSFER_SCOPE + "[*https://auth.signin.org/scopes/c1/data_access]"
    two = signin.TRANSFER_SCOPE + "[*https://auth.signin.org/scopes/c2/data_access]"
    assert signin.merge_scopes([one, two, one]) == (signin.TRANSFER_SCOPE + "[*https://auth.signin.org/scopes/c1/"
                                                    "data_access *https://auth.signin.org/scopes/c2/data_access]")
    assert signin.merge_scopes([]) == signin.TRANSFER_SCOPE


def test_a_domain_asks_for_its_account():
    url = signin.authorize_url("cid", "ch", fresh=False, domain="uni.edu")
    assert "session_required_single_domain=uni.edu" in url
