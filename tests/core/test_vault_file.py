import stat

import pytest

from hpc_hub.core.vault_file import FileVault

KEY = "0f" * 32


def test_saved_encrypted_and_private(tmp_path):
    path = tmp_path / "vault.bin"
    FileVault(path, KEY).set_password("HPC Hub", "sdsc/ssh", '{"username": "jdoe"}')
    assert FileVault(path, KEY).get_password("HPC Hub", "sdsc/ssh") == '{"username": "jdoe"}'
    assert b"jdoe" not in path.read_bytes()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_another_key_reads_nothing_and_starts_over(tmp_path):
    path = tmp_path / "vault.bin"
    FileVault(path, KEY).set_password("HPC Hub", "a", "one")
    other = FileVault(path, "1e" * 32)
    assert other.get_password("HPC Hub", "a") is None
    other.set_password("HPC Hub", "b", "two")
    assert other.get_password("HPC Hub", "b") == "two"


def test_no_key_no_vault(tmp_path, monkeypatch):
    monkeypatch.delenv("HPC_HUB_VAULT_KEY", raising=False)
    with pytest.raises(RuntimeError, match="no vault key"):
        FileVault(tmp_path / "v.bin")
