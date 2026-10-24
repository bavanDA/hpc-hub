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


def test_tests_never_reach_the_real_keyring():
    from hpc_hub.core import credentials
    for fn in (credentials._store, credentials._lookup, credentials._clear):
        assert fn.__module__ != "hpc_hub.core.credentials"  # the conftest stand-in, not the real vault
    credentials.save("zz-test", credentials.SSH, credentials.Login("jdoe", "pw"))
    assert credentials.load("zz-test", credentials.SSH) == credentials.Login("jdoe", "pw")
