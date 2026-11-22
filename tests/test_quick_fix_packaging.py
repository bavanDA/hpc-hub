import importlib.util
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("quick_fix", ROOT / "packaging" / "quick_fix.py")
quick_fix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quick_fix)


def test_rust_and_packaging_changes_need_a_build():
    assert quick_fix.needs_build(["hpc_hub/core/x.py", "app/src/App.tsx", "app/package.json"]) == []
    assert quick_fix.needs_build(["app/src-tauri/src/lib.rs", "packaging/requirements-backend.txt",
                                  "packaging/backend.py", "hpc_hub/x.py"]) == [
        "app/src-tauri/src/lib.rs", "packaging/requirements-backend.txt", "packaging/backend.py"]


def test_pack_takes_the_window_and_the_package_at_the_betas_version(tmp_path):
    dist, pkg = tmp_path / "dist", tmp_path / "hpc_hub"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>")
    (dist / "assets" / "a.js").write_text("js")
    (pkg / "__pycache__").mkdir(parents=True)
    (pkg / "__init__.py").write_text('"""doc"""\n__version__ = "0.2.5"\n')
    (pkg / "__pycache__" / "x.pyc").write_bytes(b"")
    (pkg / "m.py").write_text("x = 1\n")
    z = tmp_path / "fix.zip"
    assert quick_fix.pack(z, dist, pkg, "0.2.6-beta.9", 12) == 4
    with zipfile.ZipFile(z) as f:
        assert sorted(f.namelist()) == ["fix.json", "py/hpc_hub/__init__.py", "py/hpc_hub/m.py", "ui/assets/a.js",
                                        "ui/index.html"]
        # signed with the zip: the app takes the version and number from here, not from the feed
        assert json.loads(f.read("fix.json")) == {"base": "0.2.6-beta.9", "number": 12}
        assert '__version__ = "0.2.6-beta.9"' in f.read("py/hpc_hub/__init__.py").decode()


def test_the_signature_is_added_to_the_feed_afterwards(tmp_path):
    """The sign job runs `tauri signer sign` on the zip; --add-signature moves its .sig into the feed."""
    url = "https://github.com/bavanDA/hpc-hub/releases/download/beta/quick-fix-12.zip"
    (tmp_path / "quick-fix.json").write_text(json.dumps({"base": "0.2.6-beta.9", "number": 12, "url": url,
                                                        "signature": ""}))
    (tmp_path / "quick-fix-12.zip").write_bytes(b"zip")
    (tmp_path / "quick-fix-12.zip.sig").write_text("c2lnbmF0dXJl\n")
    assert quick_fix.add_signature(tmp_path) == "c2lnbmF0dXJl"
    assert json.loads((tmp_path / "quick-fix.json").read_text())["signature"] == "c2lnbmF0dXJl"
    assert not (tmp_path / "quick-fix-12.zip.sig").exists()
