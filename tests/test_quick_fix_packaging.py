import importlib.util
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
    assert quick_fix.pack(z, dist, pkg, "0.2.6-beta.9") == 4
    with zipfile.ZipFile(z) as f:
        assert sorted(f.namelist()) == ["py/hpc_hub/__init__.py", "py/hpc_hub/m.py", "ui/assets/a.js", "ui/index.html"]
        assert '__version__ = "0.2.6-beta.9"' in f.read("py/hpc_hub/__init__.py").decode()
