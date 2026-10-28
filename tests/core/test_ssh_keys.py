import stat

import pytest

from hpc_hub.core import ssh_keys

pytest.importorskip("asyncssh")


def test_made_once_private_and_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(ssh_keys.Path, "home", lambda: tmp_path)
    first = ssh_keys.ensure()
    assert first.startswith("ssh-ed25519 ") and first.endswith(ssh_keys.COMMENT)
    assert stat.S_IMODE(ssh_keys.key_path().stat().st_mode) == 0o600
    assert ssh_keys.ensure() == first
