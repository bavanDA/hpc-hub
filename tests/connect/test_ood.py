import pytest

from hpc_hub.connect import ood

PAGE = ('<meta name="csrf-token" content="abc&amp;1" /><a title="Logged in as bdx" data-placement="bottom">'
        '<li> <a title="Home Directory" class="dropdown-item" href="/pun/sys/dashboard/files/fs/home/bdx/expanse">')


def test_parse_dashboard():
    assert ood.parse_user(PAGE) == "bdx"
    assert ood.parse_home(PAGE) == "/home/bdx/expanse"
    assert ood.parse_csrf(PAGE) == "abc&1"
    assert ood.parse_user("<html>login</html>") == ""


def test_with_key():
    key = "ssh-ed25519 AAAA me@laptop"
    assert ood.with_key("", key) == key + "\n"
    assert ood.with_key("ssh-rsa BBBB old", key) == "ssh-rsa BBBB old\n" + key + "\n"
    assert ood.with_key("ssh-ed25519 AAAA other-comment\n", key) is None


def _cert(name, key, issuer_name, issuer_key, ca, host=None):
    import datetime

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    now = datetime.datetime.now(datetime.timezone.utc)
    b = (x509.CertificateBuilder()
         .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)]))
         .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_name)]))
         .public_key(key.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=30))
         .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
         .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_key.public_key()), critical=False))
    if ca:
        b = b.add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
    else:
        b = (b.add_extension(x509.SubjectAlternativeName([x509.DNSName(host)]), critical=False)
             .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False))
    return b.sign(issuer_key, hashes.SHA256())


def test_fetched_issuer_must_lead_to_a_trusted_root():
    pytest.importorskip("cryptography.x509.verification")
    from cryptography.hazmat.primitives.asymmetric import ec
    keys = {n: ec.generate_private_key(ec.SECP256R1()) for n in ("root", "mid", "leaf", "evil")}
    root = _cert("Root", keys["root"], "Root", keys["root"], True)
    mid = _cert("Mid", keys["mid"], "Root", keys["root"], True)
    leaf = _cert("portal.test", keys["leaf"], "Mid", keys["mid"], False, "portal.test")
    ood.check_chain(leaf, mid, "portal.test", [root])  # the real intermediate: fine
    with pytest.raises(ood.PortalError):
        ood.check_chain(leaf, mid, "other.test", [root])  # wrong host
    evil = _cert("Evil", keys["evil"], "Evil", keys["evil"], True)
    fake = _cert("portal.test", keys["leaf"], "Evil", keys["evil"], False, "portal.test")
    with pytest.raises(ood.PortalError):
        ood.check_chain(fake, evil, "portal.test", [root])  # someone on the network naming their own issuer
    assert ood.system_roots()


def test_signed_in_keeps_the_cookies_the_portal_sets(monkeypatch):
    from email.message import Message

    portal = ood.Portal("https://portal.example.edu", {"mod_auth_openidc_session": "s1", "tracker": "x"})
    sent = []

    def request(path, method="GET", data=None, headers=None):
        sent.append(dict(portal.cookies))
        reply = Message()
        reply["Set-Cookie"] = "_session_id=r2; path=/; HttpOnly"
        portal._keep(reply)
        return 200, PAGE

    monkeypatch.setattr(portal, "_request", request)
    assert portal.signed_in() == ("bdx", "/home/bdx/expanse", "abc&1")
    assert sent == [{"mod_auth_openidc_session": "s1"}]  # only the portal's own cookies go
    assert portal.cookies["_session_id"] == "r2"  # the new session goes with its CSRF token
    assert ood.Portal("https://portal.example.edu", {}).signed_in() == ("", "", "")


class FakePortal:
    good = {"s2"}  # sessions the portal takes
    keys: list = []

    def __init__(self, url, cookies):
        self.session = cookies.get(ood.SESSION)

    def signed_in(self):
        return ("jdoe", "/home/jdoe", "csrf") if self.session in self.good else ("", "", "")

    def add_key(self, home, csrf, key):
        self.keys.append((home, key))
        return True


def test_add_key_signs_in_again_when_an_old_session_is_refused(monkeypatch):
    monkeypatch.setattr(ood, "Portal", FakePortal)
    asked, users = [], []

    def sign_in(start):
        asked.append(start.reuse)
        return ("s1", "") if len(asked) == 1 else ("s2", "")  # the old session first, then a new sign-in

    got = ood.add_key_signed_in("https://portal.example.edu", sign_in, "ssh-ed25519 AAAA jdoe@laptop", users.append)
    assert got == ("jdoe", True) and asked == [True, False] and users == ["jdoe"]
    start = ood.sign_in_start("https://portal.example.edu/")
    assert start.login_url == start.final_url == "https://portal.example.edu/pun/sys/dashboard"
    assert start.token_cookie == ood.SESSION
    with pytest.raises(ood.PortalError, match="Sign-in cancelled"):
        ood.add_key_signed_in("https://portal.example.edu", lambda start: ("", "Sign-in cancelled"), "k")
