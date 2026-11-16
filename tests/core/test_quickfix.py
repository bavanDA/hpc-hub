import base64
import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from hpc_hub.core import quickfix

ROOT = Path(__file__).resolve().parents[2]
KEY_ID = b"\x01\x02\x03\x04\x05\x06\x07\x08"


def keypair():
    sk = Ed25519PrivateKey.generate()
    raw = sk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    text = f"untrusted comment: minisign public key\n{base64.b64encode(b'Ed' + KEY_ID + raw).decode()}\n"
    return sk, base64.b64encode(text.encode()).decode()


def signed(sk, data: bytes, comment: str = "timestamp:1\tfile:x.zip") -> str:
    """A signature as `tauri signer sign` writes it (prehashed minisign)."""
    sig = sk.sign(hashlib.blake2b(data, digest_size=64).digest())
    glob = sk.sign(sig + comment.encode())
    text = (f"untrusted comment: signature\n{base64.b64encode(b'ED' + KEY_ID + sig).decode()}\n"
            f"trusted comment: {comment}\n{base64.b64encode(glob).decode()}\n")
    return base64.b64encode(text.encode()).decode()


def a_zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buf.getvalue()


FIX = {"ui/index.html": "<html>fixed</html>", "py/hpc_hub/__init__.py": '__version__ = "1.0.0-beta.1"\n'}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("HPC_HUB_QUICKFIX_DIR", str(tmp_path / "quick-fix"))
    monkeypatch.setenv("HPC_HUB_APP_VERSION", "1.0.0-beta.1")
    monkeypatch.delenv("HPC_HUB_QUICKFIX_NUMBER", raising=False)
    return tmp_path / "quick-fix"


def test_the_signature_is_checked():
    sk, pub = keypair()
    data = a_zip(FIX)
    quickfix.verify(data, signed(sk, data), pub)
    with pytest.raises(quickfix.BadFix):
        quickfix.verify(data + b"!", signed(sk, data), pub)
    other, _ = keypair()
    with pytest.raises(quickfix.BadFix):
        quickfix.verify(data, signed(other, data), pub)
    with pytest.raises(quickfix.BadFix):  # the trusted comment is signed too
        text = base64.b64decode(signed(sk, data)).decode().replace("file:x.zip", "file:y.zip")
        quickfix.verify(data, base64.b64encode(text.encode()).decode(), pub)
    with pytest.raises(quickfix.BadFix):
        quickfix.verify(data, "not a signature", pub)


def test_the_key_is_the_update_key():
    conf = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
    assert quickfix.PUBKEY == conf["plugins"]["updater"]["pubkey"]


def test_only_a_newer_fix_for_this_very_version_is_offered(app):
    feed = {"base": "1.0.0-beta.1", "number": 7, "url": "https://x/quick-fix-7.zip", "signature": "s", "notes": "n"}
    assert quickfix.offered(feed, app)["number"] == 7
    assert quickfix.offered({**feed, "base": "1.0.0-beta.2"}, app) is None
    assert quickfix.offered({**feed, "number": "x"}, app) is None
    app.mkdir()
    (app / "7").mkdir()
    (app / "current.json").write_text(json.dumps({"base": "1.0.0-beta.1", "number": 7}))
    assert quickfix.offered(feed, app) is None
    assert quickfix.offered({**feed, "number": 8}, app)["number"] == 8
    (app / "failed").write_text("8\n")  # a start with it never got going
    assert quickfix.offered({**feed, "number": 8}, app) is None


def test_a_fix_for_another_version_is_not_in_use(app):
    app.mkdir()
    (app / "3").mkdir()
    (app / "current.json").write_text(json.dumps({"base": "1.0.0-beta.0", "number": 3}))
    assert quickfix.current(app) is None


def test_install_downloads_checks_and_unpacks(app, monkeypatch):
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    data = a_zip(FIX)
    feed = {"base": "1.0.0-beta.1", "number": 4, "url": "https://x/quick-fix-4.zip", "signature": signed(sk, data),
            "notes": "Paste works"}
    fetched = []

    def fetch(url, limit):
        fetched.append(url)
        return json.dumps(feed).encode() if url == quickfix.FEED else data

    fix = quickfix.check(fetch)
    assert fix["number"] == 4
    assert quickfix.install(fix, fetch) == {"base": "1.0.0-beta.1", "number": 4, "notes": "Paste works"}
    assert (app / "4" / "ui" / "index.html").read_text() == "<html>fixed</html>"
    assert (app / "4" / "py" / "hpc_hub" / "__init__.py").exists()
    assert quickfix.check(fetch) is None  # nothing newer now


def test_a_badly_signed_fix_is_not_installed(app, monkeypatch):
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    other, _ = keypair()
    data = a_zip(FIX)
    fix = {"base": "1.0.0-beta.1", "number": 4, "url": "u", "signature": signed(other, data), "notes": ""}
    with pytest.raises(quickfix.BadFix):
        quickfix.install(fix, lambda url, limit: data)
    assert quickfix.current(app) is None


@pytest.mark.parametrize("name", ["../evil.py", "/etc/x", "ui/../../x", "other/file", "C:/x"])
def test_unpack_writes_nothing_outside(tmp_path, name):
    with pytest.raises(quickfix.BadFix):
        quickfix.unpack(a_zip({**FIX, name: "x"}), tmp_path / "1")
    assert not (tmp_path / "1").exists()


def test_older_fixes_are_tidied_but_not_the_running_one(app, monkeypatch):
    app.mkdir()
    for n in ("1", "2", "3"):
        (app / n).mkdir()
    (app / "current.json").write_text(json.dumps({"base": "1.0.0-beta.1", "number": 3}))
    monkeypatch.setenv("HPC_HUB_QUICKFIX_NUMBER", "2")
    quickfix.tidy(app)
    assert sorted(d.name for d in app.iterdir() if d.is_dir()) == ["2", "3"]
    assert quickfix.label() == "1.0.0-beta.1 fix 2"


def test_a_build_without_quick_fixes_offers_none(monkeypatch):
    monkeypatch.delenv("HPC_HUB_QUICKFIX_DIR", raising=False)
    assert quickfix.check(lambda url, limit: pytest.fail("no download")) is None
