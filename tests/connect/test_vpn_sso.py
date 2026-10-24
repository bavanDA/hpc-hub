import pytest

from hpc_hub.connect import vpn_sso

NJIT = """<?xml version="1.0" encoding="UTF-8"?>
<config-auth client="vpn" type="auth-request" aggregate-auth-version="2">
<opaque is-for="sg"><tunnel-group>NJIT</tunnel-group><config-hash>123</config-hash></opaque>
<auth id="main">
<sso-v2-login>https://mfavpn.njit.edu/+CSCOE+/saml/sp/login?ctx=1&#x26;acsamlcap=v2</sso-v2-login>
<sso-v2-login-final>https://mfavpn.njit.edu/+CSCOE+/saml_ac_login.html</sso-v2-login-final>
<sso-v2-token-cookie-name>acSamlv2Token</sso-v2-token-cookie-name>
<sso-v2-error-cookie-name>acSamlv2Error</sso-v2-error-cookie-name>
</auth></config-auth>"""


def test_parse_start():
    s = vpn_sso.parse_start(NJIT, "https://vpn.njit.edu/")
    assert s.login_url == "https://mfavpn.njit.edu/+CSCOE+/saml/sp/login?ctx=1&acsamlcap=v2"
    assert s.final_url.endswith("saml_ac_login.html") and s.token_cookie == "acSamlv2Token"
    assert s.opaque.startswith('<opaque is-for="sg">') and "NJIT" in s.opaque
    assert vpn_sso.parse_start("<config-auth><auth id='main'></auth></config-auth>", "x") is None


def test_finish_body_and_session():
    body = vpn_sso.finish_body('<opaque is-for="sg">o</opaque>', "tok&<")
    assert "<sso-token>tok&amp;&lt;</sso-token>" in body and '<opaque is-for="sg">o</opaque>' in body
    ok = '<config-auth type="complete"><auth id="success"></auth><session-token>ABC@123</session-token></config-auth>'
    assert vpn_sso.parse_session(ok) == "ABC@123"
    with pytest.raises(vpn_sso.SsoError, match="Login failed"):
        vpn_sso.parse_session("<config-auth><auth id='main'><error>Login failed</error></auth></config-auth>")


def test_server_pin_format(monkeypatch):
    import datetime
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "vpn.test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(1).not_valid_before(now).not_valid_after(now + datetime.timedelta(days=1))
            .sign(key, hashes.SHA256()))
    der = cert.public_bytes(serialization.Encoding.DER)

    class FakeTls:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def getpeercert(self, binary_form=False): return der

    class FakeCtx:
        def wrap_socket(self, raw, server_hostname=None): return FakeTls()

    monkeypatch.setattr(vpn_sso.ssl, "create_default_context", lambda: FakeCtx())
    monkeypatch.setattr(vpn_sso.socket, "create_connection", lambda *a, **k: FakeTls())
    import base64, hashlib
    spki = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    assert vpn_sso.server_pin("vpn.test") == "pin-sha256:" + base64.b64encode(hashlib.sha256(spki).digest()).decode()
