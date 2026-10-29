"""The desktop's QR code for the phone app, with a fake keyring."""

import pytest

from hpc_hub.core import credentials, pairing
from hpc_hub.core.credentials import Login
from hpc_hub.core.pairing import Code, Entry


@pytest.fixture
def store(monkeypatch):
    saved = {("wulver", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", ""),
             ("yale", "vpn"): Login("abc123", "vpnpass")}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    return saved


def test_saved_logins(store):
    assert pairing.saved(["wulver", "sdsc", "yale"]) == [Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2")]
    assert pairing.saved(["wulver"], passwords=False) == [Entry("wulver", "jdoe")]


def test_code_round_trip():
    c = Code([Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", "ignored", key=True)], b"k" * 32)
    text = pairing.code(c, now=1000)
    assert text.startswith(pairing.PREFIX) and "ignored" not in str(pairing.parse(text, now=1000))
    assert pairing.parse(text, now=1000) == Code([Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True)],
                                                 b"k" * 32)
    assert pairing.parse(pairing.code(Code([Entry("wulver", "jdoe")]), now=1), now=1).key == b""


def test_old_or_wrong_codes():
    text = pairing.code(Code([Entry("wulver", "jdoe")]), now=1000)
    with pytest.raises(pairing.PairingError, match="too old"):
        pairing.parse(text, now=1000 + pairing.LIFETIME + 1)
    with pytest.raises(pairing.PairingError, match="not an HPC Hub code"):
        pairing.parse("https://example.com")
    with pytest.raises(pairing.PairingError, match="could not be read"):
        pairing.parse(pairing.PREFIX + "bm90IGpzb24")


def test_matrix_is_a_qr_code():
    text = pairing.code(Code([Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True)], b"k" * 32))
    m = pairing.matrix(text)
    size = len(m)
    assert all(len(row) == size for row in m) and (size - 8 - 17) % 4 == 0  # version n is 17 + 4n squares
    assert not any(m[0]) and not any(row[0] for row in m)  # the quiet border
    for x, y in ((4, 4), (size - 11, 4), (4, size - 11)):  # the three finder squares: a dark ring, then light
        assert all(m[y][x + i] and m[y + 6][x + i] and m[y + i][x] and m[y + i][x + 6] for i in range(7))
        assert not m[y + 1][x + 1] and m[y + 3][x + 3]
