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
