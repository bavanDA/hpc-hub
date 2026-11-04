import subprocess
import sys

from hpc_hub.pdf.readaloud import env


def test_clean_drops_the_bundles_python_and_libraries(monkeypatch):
    """The AppImage sets these for its own Python; the voice's Python can't start with them."""
    monkeypatch.setenv("APPDIR", "/tmp/.mount_HPC-Hub1")
    monkeypatch.setenv("PYTHONHOME", "/tmp/.mount_HPC-Hub1/usr/")
    monkeypatch.setenv("PYTHONPATH", "/tmp/.mount_HPC-Hub1/usr/share/pyshared/:")
    monkeypatch.setenv("LD_LIBRARY_PATH", "/tmp/.mount_HPC-Hub1/usr/lib/:/opt/cuda/lib64")
    got = env.clean()
    assert "PYTHONHOME" not in got and "PYTHONPATH" not in got
    assert got["LD_LIBRARY_PATH"] == "/opt/cuda/lib64"


def test_another_python_starts_with_it(monkeypatch, tmp_path):
    monkeypatch.setenv("APPDIR", str(tmp_path))
    monkeypatch.setenv("PYTHONHOME", str(tmp_path / "usr"))  # where no Python lives, as in the AppImage
    res = subprocess.run([sys.executable, "-c", "print('ok')"], capture_output=True, text=True, env=env.clean())
    assert res.stdout.strip() == "ok"
