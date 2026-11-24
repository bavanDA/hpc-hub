"""Settings > Back up (core/settings_backup.py): the file is locked with your password, holds the settings and saved
logins, and puts them back. A made-up home and keyring only."""

import json
import os
import sys

import pytest

from hpc_hub.core import credentials
from hpc_hub.core import settings_backup as backup

PASSWORD = "correct horse battery"


@pytest.fixture
def home(tmp_path, monkeypatch):
    config = tmp_path / ".config" / "hpc-hub"
    config.mkdir(parents=True)
    (config / "clusters.toml").write_text('[clusters.wulver]\nname = "Wulver (NJIT)"\nhost = "wulver.example.edu"\n'
                                          '[clusters.bouchet]\nname = "Yale Bouchet"\n')
    (config / "app.toml").write_text('[app]\nappearance = "dark"\n')
    (config / "clusters.toml.bak-ask").write_text("old")  # a backup of its own: stays out
    monkeypatch.setattr(backup, "CONFIG_DIR", config)
    vault: dict[tuple[str, str], credentials.Login] = {
        ("wulver", "ssh"): credentials.Login("jdoe", "pw-ssh"),
        ("wulver", "vpn"): credentials.Login("jdoe", "pw-vpn"),
        # a "-" can't come up by chance in the file's base64, as "tok" did once in a while
        ("globus", "tokens"): credentials.Login("globus", '{"access": "tok-globus-1"}'),
    }
    monkeypatch.setattr(credentials, "load", lambda c, k: vault.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: vault.__setitem__((c, k), login))
    monkeypatch.setattr(backup, "SCRYPT", {"n": 2 ** 10, "r": 8, "p": 1})  # quick in tests
    return tmp_path, config, vault


def test_export_then_import_brings_settings_and_logins_back(home):
    tmp, config, vault = home
    path = backup.write(str(tmp), backup.gather(["wulver", "bouchet"], "0.2.7"), PASSWORD)
    assert path.name.endswith(".hpchub")
    if sys.platform != "win32":
        assert oct(path.stat().st_mode & 0o777) == "0o600"  # only you may read it
    raw = path.read_text()
    for secret in ("pw-ssh", "pw-vpn", "jdoe", "Wulver", "tok-globus-1"):
        assert secret not in raw  # nothing readable without the password

    s = backup.summary(backup.read(str(path), PASSWORD))
    assert s["clusters"] == ["Wulver (NJIT)", "Yale Bouchet"]
    assert s["files"] == ["app.toml", "clusters.toml"] and s["globus"]
    assert s["logins"] == ["wulver (SSH)", "wulver (VPN)"]

    (config / "app.toml").write_text('[app]\nappearance = "light"\n')  # changed since
    vault.clear()
    done = backup.restore(backup.read(str(path), PASSWORD))
    assert done["files"] == 2 and done["logins"] == 3
    assert 'appearance = "dark"' in (config / "app.toml").read_text()
    assert vault[("wulver", "vpn")] == credentials.Login("jdoe", "pw-vpn")
    aside = [p for p in config.iterdir() if p.name.startswith("before-import-")]
    assert len(aside) == 1 and 'appearance = "light"' in (aside[0] / "app.toml").read_text()  # nothing lost


def test_a_wrong_password_opens_nothing(home):
    tmp, _, _ = home
    path = backup.write(str(tmp), backup.gather(["wulver"], "0.2.7"), PASSWORD)
    with pytest.raises(backup.WrongPassword):
        backup.read(str(path), "not the password")


def test_a_changed_file_is_refused(home):
    tmp, _, _ = home
    path = backup.write(str(tmp), backup.gather(["wulver"], "0.2.7"), PASSWORD)
    whole = json.loads(path.read_text())
    whole["kdf"]["n"] = 2 ** 11  # the header is sealed with the contents
    path.write_text(json.dumps(whole))
    with pytest.raises(backup.BackupError):
        backup.read(str(path), PASSWORD)


def test_other_files_and_costly_settings_are_refused(home):
    tmp, _, _ = home
    (tmp / "notes.txt").write_text("hello")
    with pytest.raises(backup.BackupError, match="isn't an HPC Hub backup"):
        backup.read(str(tmp / "notes.txt"), PASSWORD)
    greedy = {"format": "hpc-hub-backup", "v": 1, "kdf": {"name": "scrypt", "n": 2 ** 30, "r": 8, "p": 1},
              "salt": "AA==", "nonce": "AA==", "data": "AA=="}
    (tmp / "greedy.hpchub").write_text(json.dumps(greedy))
    with pytest.raises(backup.BackupError):
        backup.read(str(tmp / "greedy.hpchub"), PASSWORD)  # a file can't make the app spend gigabytes


def test_a_short_password_is_refused(home):
    tmp, _, _ = home
    with pytest.raises(backup.BackupError, match="at least 8"):
        backup.write(str(tmp), backup.gather([], "0.2.7"), "short")


def test_a_second_export_the_same_day_gets_its_own_name(home):
    tmp, _, _ = home
    a = backup.write(str(tmp), backup.gather([], "0.2.7"), PASSWORD)
    b = backup.write(str(tmp), backup.gather([], "0.2.7"), PASSWORD)
    assert a != b and a.exists() and b.exists()


def test_import_writes_only_settings_files_in_their_folder(home):
    _, config, _ = home
    evil = {"files": {"../escape.toml": "x", "/etc/passwd.toml": "x", "ok.json": "{}", "run.sh": "x"}, "logins": []}
    done = backup.restore(evil)
    assert done["files"] == 1 and (config / "ok.json").exists()
    assert not (config.parent / "escape.toml").exists()
    assert not any(p.name == "run.sh" for p in config.iterdir())


def test_the_file_is_still_closed_to_a_different_user_mode(home):
    if sys.platform == "win32":
        pytest.skip("permission bits are POSIX")
    tmp, _, _ = home
    path = backup.write(str(tmp), backup.gather([], "0.2.7"), PASSWORD)
    assert not os.access(path, os.X_OK)
