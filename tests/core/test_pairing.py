"""The desktop's QR code for the phone app, with a fake keyring."""

import pytest

from hpc_hub.core import credentials, pairing
from hpc_hub.core.credentials import Login


@pytest.fixture
def store(monkeypatch):
    saved = {("wulver", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", ""),
             ("yale", "vpn"): Login("abc123", "vpnpass")}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    return saved


def test_code_round_trip(store):
    text, has = pairing.code(["wulver", "sdsc", "yale"], now=1000)
    assert text.startswith(pairing.PREFIX) and has == ["wulver", "sdsc"]  # yale has no ssh login
    assert pairing.parse(text, now=1000) == [pairing.Entry("wulver", "jdoe", "s3cret"), pairing.Entry("sdsc", "jdoe2")]


def test_without_passwords(store):
    text, _ = pairing.code(["wulver"], passwords=False, now=1000)
    assert pairing.parse(text, now=1000) == [pairing.Entry("wulver", "jdoe")]
    assert "s3cret" not in text


def test_old_or_wrong_codes(store):
    text, _ = pairing.code(["wulver"], now=1000)
    with pytest.raises(pairing.PairingError, match="too old"):
        pairing.parse(text, now=1000 + pairing.LIFETIME + 1)
    with pytest.raises(pairing.PairingError, match="not an HPC Hub code"):
        pairing.parse("https://example.com")
    with pytest.raises(pairing.PairingError, match="could not be read"):
        pairing.parse(pairing.PREFIX + "bm90IGpzb24")
