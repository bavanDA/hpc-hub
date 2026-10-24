import sys
import types

import pytest

from hpc_hub.core import credentials

pytestmark = pytest.mark.keyring_backends  # these stand in for the vault modules themselves


def _fake_keyring(monkeypatch):
    """keyring's backend modules, standing in for the real ones (not installed here)."""
    store = {}

    class Vault:
        def set_password(self, s, a, p):
            store[(s, a)] = p

        def get_password(self, s, a):
            return store.get((s, a))

    mods = {"keyring": types.ModuleType("keyring"), "keyring.backends": types.ModuleType("keyring.backends"),
            "keyring.backends.macOS": types.ModuleType("keyring.backends.macOS"),
            "keyring.backends.Windows": types.ModuleType("keyring.backends.Windows")}
    mods["keyring.backends.macOS"].Keyring = Vault
    mods["keyring.backends.Windows"].WinVaultKeyring = Vault
    for name, m in mods.items():
        monkeypatch.setitem(sys.modules, name, m)
    monkeypatch.setattr(credentials, "Secret", None)
    return store


@pytest.mark.parametrize("platform", ["darwin", "win32"])
def test_mac_and_windows_use_their_own_vault(monkeypatch, platform):
    store = _fake_keyring(monkeypatch)
    monkeypatch.setattr(credentials.sys, "platform", platform)
    credentials.save("wulver", credentials.SSH, credentials.Login("jdoe", "pw"))
    assert credentials.load("wulver", credentials.SSH) == credentials.Login("jdoe", "pw")
    assert list(store) == [("HPC Hub", "wulver/ssh")]


def test_no_vault_means_no_saving(monkeypatch):
    _fake_keyring(monkeypatch)
    monkeypatch.setattr(credentials.sys, "platform", "freebsd14")
    with pytest.raises(RuntimeError, match="No safe place"):
        credentials.save("wulver", credentials.SSH, credentials.Login("jdoe", "pw"))
