import subprocess
import sys

import pytest

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


def test_its_python_and_pip_where_each_system_puts_them(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    monkeypatch.setattr(env.sys, "platform", "win32")
    assert env._program("pip") == tmp_path / "hpc-hub" / "tts" / "Scripts" / "pip.exe"
    monkeypatch.setattr(env.sys, "platform", "linux")
    assert env._program("python") == tmp_path / "hpc-hub" / "tts" / "bin" / "python"


def test_the_system_python_that_makes_it(monkeypatch):
    have = {"py", "python3"}
    monkeypatch.setattr(env.shutil, "which", lambda name: name if name in have else None)
    monkeypatch.setattr(env.sys, "platform", "win32")
    assert env._system_python() == ["py", "-3"]
    have = {"python"}
    assert env._system_python() == ["python"]
    monkeypatch.setattr(env.sys, "platform", "darwin")
    have = {"python3"}
    assert env._system_python() == ["python3"]
    have = set()
    with pytest.raises(RuntimeError, match="needs Python 3"):
        env._system_python()
