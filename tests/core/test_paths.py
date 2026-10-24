import pytest

from hpc_hub.core import paths


def test_runtime_dir_must_be_yours(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "run"))
    (tmp_path / "run").mkdir()
    assert paths.runtime_dir() == tmp_path / "run" / "hpc-hub"
    (tmp_path / "run" / "hpc-hub").rmdir()
    (tmp_path / "elsewhere").mkdir()
    (tmp_path / "run" / "hpc-hub").symlink_to(tmp_path / "elsewhere")  # someone else's trick
    with pytest.raises(RuntimeError):
        paths.runtime_dir()
