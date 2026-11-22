"""The desktop's QR code for the phone app, sealed with the code the phone shows, with a fake keyring."""

import base64
import json
import re

import pytest

from hpc_hub.core import credentials, pairing
from hpc_hub.core.credentials import Login
from hpc_hub.core.pairing import Code, Entry

PHONE = "7K2QM-X9D4R"  # made up, as the phone would show it


@pytest.fixture
def store(monkeypatch):
    saved = {("demo", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", ""),
             ("yale", "vpn"): Login("abc123", "vpnpass")}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    return saved


def _blob(text: str) -> bytes:
    body = text[len(pairing.PREFIX):]
    return base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))


def _text(blob: bytes) -> str:
    return pairing.PREFIX + base64.urlsafe_b64encode(blob).decode().rstrip("=")


def test_saved_logins(store):
    assert pairing.saved(["demo", "sdsc", "yale"]) == [Entry("demo", "jdoe", "s3cret"), Entry("sdsc", "jdoe2")]
    assert pairing.saved(["demo"], passwords=False) == [Entry("demo", "jdoe")]


def test_code_round_trip():
    c = Code([Entry("demo", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", "ignored", key=True)], b"k" * 32)
    text = pairing.code(c, PHONE, now=1000)
    assert text.startswith("hpchub-pair:2:") and "ignored" not in str(pairing.parse(text, PHONE, now=1000))
    assert pairing.parse(text, PHONE, now=1000) == Code([Entry("demo", "jdoe", "s3cret"),
                                                         Entry("sdsc", "jdoe2", key=True)], b"k" * 32)
    assert pairing.parse(pairing.code(Code([Entry("demo", "jdoe")]), PHONE, now=1), PHONE, now=1).key == b""


def test_the_code_typed_any_way_opens_it():
    text = pairing.code(Code([Entry("demo", "jdoe", "s3cret")]), " 7k2qm x9d4r ", now=1)
    assert pairing.parse(text, PHONE, now=1).entries == [Entry("demo", "jdoe", "s3cret")]


def test_a_photo_of_the_qr_shows_no_login_or_key():
    """2026-11-22 review: the QR held passwords and the phone's SSH key seed in plain base64."""
    seed = bytes(range(32))
    text = pairing.code(Code([Entry("demo", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True)], seed), PHONE)
    blob = _blob(text)
    for secret in (b"jdoe", b"s3cret", b"logins", b"exp", seed, base64.urlsafe_b64encode(seed).rstrip(b"=")):
        assert secret not in blob
    assert "s3cret" not in text and "logins" not in text
    assert len(blob) > pairing.SALT + pairing.NONCE + pairing.TAG
    again = _blob(pairing.code(Code([Entry("demo", "jdoe", "s3cret")]), PHONE, now=0))
    other = _blob(pairing.code(Code([Entry("demo", "jdoe", "s3cret")]), PHONE, now=0))
    assert again[:pairing.SALT] != other[:pairing.SALT]  # a new salt and nonce every time
    assert again[pairing.SALT:pairing.SALT + pairing.NONCE] != other[pairing.SALT:pairing.SALT + pairing.NONCE]


def test_another_phones_code_cannot_open_it():
    text = pairing.code(Code([Entry("demo", "jdoe", "s3cret")]), PHONE, now=1)
    with pytest.raises(pairing.PairingError) as got:
        pairing.parse(text, "7K2QM-X9D4S", now=1)
    assert str(got.value) == ("This code was made for another phone code. Type the code shown on this phone on the "
                              "desktop again.")


@pytest.mark.parametrize("where", [0, pairing.SALT, pairing.SALT + pairing.NONCE, -1])  # salt, nonce, text, tag
def test_a_changed_byte_is_refused(where):
    blob = bytearray(_blob(pairing.code(Code([Entry("demo", "jdoe", "s3cret")]), PHONE, now=1)))
    blob[where] ^= 1
    with pytest.raises(pairing.PairingError, match="made for another phone code"):
        pairing.parse(_text(bytes(blob)), PHONE, now=1)


def test_the_prefix_is_sealed_in():
    """The version is the associated data: the same bytes under another prefix do not open."""
    text = pairing.code(Code([Entry("demo", "jdoe")]), PHONE, now=1)
    blob = _blob(text)
    key = pairing._key(PHONE, blob[:pairing.SALT])
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce, sealed = blob[pairing.SALT:pairing.SALT + pairing.NONCE], blob[pairing.SALT + pairing.NONCE:]
    assert json.loads(AESGCM(key).decrypt(nonce, sealed, b"hpchub-pair:2:"))["logins"] == {"demo": {"user": "jdoe"}}
    with pytest.raises(InvalidTag):
        AESGCM(key).decrypt(nonce, sealed, b"hpchub-pair:3:")


def test_a_version_1_code_is_refused():
    old = {"exp": 2000, "logins": {"demo": {"user": "jdoe", "password": "s3cret"}}}
    text = "hpchub-pair:1:" + base64.urlsafe_b64encode(json.dumps(old).encode()).decode().rstrip("=")
    with pytest.raises(pairing.PairingError, match="older HPC Hub on the desktop. Update HPC Hub there"):
        pairing.parse(text, PHONE, now=1000)
    with pytest.raises(pairing.PairingError, match="newer HPC Hub on the desktop. Update the phone app"):
        pairing.parse("hpchub-pair:3:AAAA", PHONE)


def test_old_or_wrong_codes():
    text = pairing.code(Code([Entry("demo", "jdoe")]), PHONE, now=1000)
    assert pairing.parse(text, PHONE, now=1000 + pairing.LIFETIME).entries == [Entry("demo", "jdoe")]
    with pytest.raises(pairing.PairingError, match="too old"):
        pairing.parse(text, PHONE, now=1000 + pairing.LIFETIME + 1)
    with pytest.raises(pairing.PairingError, match="not an HPC Hub code"):
        pairing.parse("https://example.com", PHONE)
    for bad in ("bm90IGpzb24", "!!!", ""):
        with pytest.raises(pairing.PairingError, match="could not be read"):
            pairing.parse(pairing.PREFIX + bad, PHONE)


def test_a_sealed_body_that_is_not_logins_could_not_be_read():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt, nonce = b"s" * pairing.SALT, b"n" * pairing.NONCE
    for body in (b"not json", b'{"exp": 1}', b"[1, 2]"):
        sealed = AESGCM(pairing._key(PHONE, salt)).encrypt(nonce, body, pairing.PREFIX.encode())
        with pytest.raises(pairing.PairingError, match="could not be read"):
            pairing.parse(_text(salt + nonce + sealed), PHONE)


def test_normalize_takes_the_code_as_people_type_it():
    for typed in ("7K2QM-X9D4R", "7k2qm-x9d4r", "7K2QM X9D4R", " 7k2qmx9d4r\n", "7K2-QM-X9-D4R", "7K2QM–X9D4R"):
        assert pairing.normalize(typed) == "7K2QMX9D4R", typed
    assert pairing.normalize("oil00-11abc") == "0110011ABC"  # O is 0, I and L are 1, as Crockford reads them
    for typed, n in (("7K2QM-X9D4", 9), ("7K2QM-X9D4RR", 11), ("", 0), ("--  --", 0)):
        with pytest.raises(pairing.PairingError, match=f"like 7K2QM-X9D4R, and this one has {n}\\."):
            pairing.normalize(typed)
    with pytest.raises(pairing.PairingError, match="has no U"):
        pairing.normalize("7K2QM-X9D4U")
    with pytest.raises(pairing.PairingError, match="10 letters"):
        pairing.code(Code([Entry("demo", "jdoe")]), "7K2QM")


def test_phone_codes_are_random_and_readable():
    codes = {pairing.phone_code() for _ in range(200)}
    assert len(codes) == 200
    for c in codes:
        assert re.fullmatch(r"[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}", c), c
        assert pairing.normalize(c) == c.replace("-", "")
    assert set("".join(codes)) - {"-"} <= set(pairing.ALPHABET) and len(pairing.ALPHABET) == 32
    assert not set("ILOU") & set(pairing.ALPHABET)


def test_matrix_is_a_qr_code():
    text = pairing.code(Code([Entry("demo", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True)], b"k" * 32), PHONE)
    m = pairing.matrix(text)
    size = len(m)
    assert all(len(row) == size for row in m) and (size - 8 - 17) % 4 == 0  # version n is 17 + 4n squares
    assert not any(m[0]) and not any(row[0] for row in m)  # the quiet border
    for x, y in ((4, 4), (size - 11, 4), (4, size - 11)):  # the three finder squares: a dark ring, then light
        assert all(m[y][x + i] and m[y + 6][x + i] and m[y + i][x] and m[y + i][x + 6] for i in range(7))
        assert not m[y + 1][x + 1] and m[y + 3][x + 3]


def test_a_vpn_login_of_its_own_comes_along(store):
    store[("yale", "ssh")] = Login("jd123", "")
    assert pairing.saved(["yale"]) == [Entry("yale", "jd123", vpn_user="abc123", vpn_password="vpnpass")]
    assert pairing.saved(["yale"], passwords=False) == [Entry("yale", "jd123", vpn_user="abc123")]
    entry = Entry("yale", "jd123", key=True, vpn_user="abc123", vpn_password="vpnpass")
    assert pairing.parse(pairing.code(Code([entry], b"k" * 32), PHONE, now=1), PHONE, now=1).entries == [entry]
