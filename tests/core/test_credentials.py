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


def test_android_keeps_logins_in_the_encrypted_file(monkeypatch, tmp_path):
    monkeypatch.setattr(credentials, "Secret", None)
    monkeypatch.setattr(credentials.sys, "platform", "android")
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    monkeypatch.setenv("HPC_HUB_VAULT_KEY", "ab" * 32)
    credentials.save("wulver", credentials.SSH, credentials.Login("jdoe", "pw"))
    assert credentials.load("wulver", credentials.SSH) == credentials.Login("jdoe", "pw")
    assert b"jdoe" not in (tmp_path / "hpc-hub" / "vault.bin").read_bytes()
    credentials.clear("wulver", credentials.SSH)
    credentials.clear("wulver", credentials.SSH)  # nothing saved: fine
    assert credentials.load("wulver", credentials.SSH) is None


def test_cluster_username_drops_the_campus_email_domain():
    from hpc_hub.core.credentials import cluster_username
    assert cluster_username("wulver.njit.edu", "ab123@njit.edu") == "ab123"
    assert cluster_username("wulver.njit.edu", " AB123@NJIT.edu ") == "ab123"  # an email's case doesn't matter
    assert cluster_username("bouchet.ycrc.yale.edu", "jd23@yale.edu") == "jd23"
    assert cluster_username("wulver.njit.edu", "ab123") == "ab123"
    assert cluster_username("wulver.njit.edu", "AB123") == "AB123"  # no email: left as typed
    assert cluster_username("login.expanse.sdsc.edu", "jd@gmail.com") == "jd@gmail.com"  # another domain: kept
    assert cluster_username("wulver.njit.edu", "ab123@notnjit.edu") == "ab123@notnjit.edu"
