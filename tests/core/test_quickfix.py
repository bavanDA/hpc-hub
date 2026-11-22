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
URL = "https://github.com/bavanDA/hpc-hub/releases/download/beta/quick-fix-4.zip"


def for_fix(number: int, base: str = "1.0.0-beta.1", files: dict | None = None) -> bytes:
    """A fix zip as packaging/quick_fix.py packs it: fix.json, signed with the rest, names what it is for."""
    return a_zip({"fix.json": json.dumps({"base": base, "number": number}), **(files or FIX)})


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
    feed = {"base": "1.0.0-beta.1", "number": 7, "url": URL, "signature": "s", "notes": "n"}
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
    data = for_fix(4)
    feed = {"base": "1.0.0-beta.1", "number": 4, "url": URL, "signature": signed(sk, data), "notes": "Paste works"}
    fetched = []

    def fetch(url, limit):
        fetched.append(url)
        return json.dumps(feed).encode() if url == quickfix.FEED else data

    fix = quickfix.check(fetch)
    assert fix["number"] == 4
    assert quickfix.install(fix, fetch) == {"base": "1.0.0-beta.1", "number": 4, "notes": "Paste works"}
    assert (app / "4" / "ui" / "index.html").read_text() == "<html>fixed</html>"
    assert (app / "4" / "py" / "hpc_hub" / "__init__.py").exists()
    # kept for the window to check again at every start (quickfix.rs)
    assert (app / "4" / "fix.zip").read_bytes() == data
    assert (app / "4" / "fix.zip.sig").read_text() == feed["signature"]
    assert quickfix.check(fetch) is None  # nothing newer now


def test_a_badly_signed_fix_is_not_installed(app, monkeypatch):
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    other, _ = keypair()
    data = for_fix(4)
    fix = {"base": "1.0.0-beta.1", "number": 4, "url": URL, "signature": signed(other, data), "notes": ""}
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


def test_a_quick_fix_uses_the_bundles_helpers(tmp_path):
    """ssh starts bin/hpc-hub-askpass by path; a quick fix has no bin/, so the frozen bundle's is used."""
    from hpc_hub.core import paths
    fix, bundle = tmp_path / "quick-fix" / "4" / "py", tmp_path / "_MEI123"
    (bundle / "bin").mkdir(parents=True)
    (bundle / "bin" / "hpc-hub-askpass").write_text("#!/bin/sh\n")
    assert paths.helper("hpc-hub-askpass", fix, str(bundle)) == bundle / "bin" / "hpc-hub-askpass"
    assert paths.helper("hpc-hub-askpass", ROOT, str(bundle)) == ROOT / "bin" / "hpc-hub-askpass"  # its own first
    assert paths.helper("hpc-hub-askpass", ROOT, "") == ROOT / "bin" / "hpc-hub-askpass"  # not frozen


def test_a_release_reads_the_releases_fixes(app, monkeypatch):
    """A beta and a release each have their own feed, so a fix for either is out in a minute."""
    assert quickfix.feed_url() == quickfix.FEED  # 1.0.0-beta.1
    monkeypatch.setenv("HPC_HUB_APP_VERSION", "1.0.0")
    assert quickfix.feed_url() == quickfix.RELEASE_FEED
    feed = {"base": "1.0.0", "number": 9, "url": URL, "signature": "s", "notes": ""}
    asked = []
    assert quickfix.check(lambda url, limit: asked.append(url) or json.dumps(feed).encode())["number"] == 9
    assert asked == [quickfix.RELEASE_FEED]


def test_an_old_signed_fix_cant_be_passed_off_as_a_newer_one(app, monkeypatch):
    """The feed isn't signed: someone who can change it could offer fix 3's genuine zip as fix 9."""
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    old = for_fix(3)
    fix = {"base": "1.0.0-beta.1", "number": 9, "url": URL, "signature": signed(sk, old), "notes": ""}
    with pytest.raises(quickfix.BadFix, match="fix 3"):
        quickfix.install(fix, lambda url, limit: old)
    assert quickfix.current(app) is None and not (app / "9").exists()


def test_a_signed_fix_for_another_version_is_refused(app, monkeypatch):
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    other = for_fix(4, base="1.0.0-beta.0")  # a real fix, for the beta before
    fix = {"base": "1.0.0-beta.1", "number": 4, "url": URL, "signature": signed(sk, other), "notes": ""}
    with pytest.raises(quickfix.BadFix, match="1.0.0-beta.0"):
        quickfix.install(fix, lambda url, limit: other)
    assert quickfix.current(app) is None


def test_a_signed_zip_that_doesnt_say_what_it_is_for_is_refused(app, monkeypatch):
    sk, pub = keypair()
    monkeypatch.setattr(quickfix, "PUBKEY", pub)
    data = a_zip(FIX)  # packed before fix.json existed
    fix = {"base": "1.0.0-beta.1", "number": 4, "url": URL, "signature": signed(sk, data), "notes": ""}
    with pytest.raises(quickfix.BadFix, match="which version"):
        quickfix.install(fix, lambda url, limit: data)


@pytest.mark.parametrize("url", ["http://github.com/bavanDA/hpc-hub/releases/download/beta/q.zip",
                                 "https://example.com/bavanDA/hpc-hub/releases/download/beta/q.zip",
                                 "https://github.com/someone/hpc-hub/releases/download/beta/q.zip",
                                 "https://github.com/bavanDA/hpc-hub/releases/download/../../x/q.zip",
                                 "file:///tmp/q.zip", "", None])
def test_fixes_come_only_from_hpc_hubs_releases_over_https(app, url):
    feed = {"base": "1.0.0-beta.1", "number": 7, "url": url, "signature": "s", "notes": ""}
    assert quickfix.offered(feed, app) is None
    with pytest.raises(quickfix.BadFix):
        quickfix.install({**feed, "url": url or ""}, lambda u, limit: pytest.fail("never downloaded"))


def test_the_update_key_never_shares_a_job_with_npm():
    """The Quick fix workflow: npm ci runs hundreds of packages' code; none of it may see the key or a write token."""
    text = (ROOT / ".github" / "workflows" / "quick-fix.yml").read_text()
    build, sign = text.split("\n  sign:\n")
    assert "npm ci" in build and "SIGNING" not in build and "contents: write" not in build
    assert "GH_TOKEN" not in build.split("- run: npm ci")[1]  # only the step that reads the beta's version has it
    assert "npm ci" not in sign and "cache: npm" not in sign
    assert "--ignore-scripts" in sign and "@tauri-apps/cli@$V" in sign
    steps = sign.split("\n      - ")
    with_key = [st for st in steps if "TAURI_SIGNING_PRIVATE_KEY" in st]
    assert len(with_key) == 1 and with_key[0].startswith("name: Sign")
    assert "env:" not in sign.split("steps:")[0]  # no job-wide secrets
    assert "--unsigned" in build
