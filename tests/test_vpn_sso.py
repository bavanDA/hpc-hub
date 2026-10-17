import pytest

from hpc_hub import vpn_sso

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
