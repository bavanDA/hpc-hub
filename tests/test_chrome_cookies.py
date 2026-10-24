import hashlib

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from hpc_hub.connect import chrome_cookies as cc


def _encrypt(plain: bytes, password: str) -> bytes:
    p = padding.PKCS7(128).padder()
    data = p.update(plain) + p.finalize()
    e = Cipher(algorithms.AES(cc._key(password)), modes.CBC(b" " * 16)).encryptor()
    return b"v11" + e.update(data) + e.finalize()


def test_decrypt_strips_host_hash():
    host = "vpn.njit.edu"
    value = _encrypt(hashlib.sha256(host.encode()).digest() + b"TOKEN", "secret")
    assert cc.decrypt(value, host, "secret") == "TOKEN"
    assert cc.decrypt(_encrypt(b"OLD", "secret"), host, "secret") == "OLD"  # older Chrome: no hash


def test_host_match():
    assert cc._matches("vpn.njit.edu", "vpn.njit.edu")
    assert cc._matches(".njit.edu", "vpn.njit.edu")
    assert not cc._matches("evil.edu", "vpn.njit.edu") and not cc._matches(".jit.edu", "vpn.njit.edu")
