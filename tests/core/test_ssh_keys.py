"""The phone's SSH key: made on the desktop, saved on the phone, added once to the cluster."""

import stat
import subprocess

from hpc_hub.core import ssh_keys


def test_saved_key_matches_its_public_line(monkeypatch, tmp_path):
    monkeypatch.setattr(ssh_keys.Path, "home", lambda: tmp_path)
    seed = ssh_keys.new()
    line = ssh_keys.public_line(seed)
    assert line.startswith("ssh-ed25519 ") and line.endswith(" " + ssh_keys.COMMENT)
    ssh_keys.save(seed)
    key = ssh_keys.key_path()
    assert stat.S_IMODE(key.stat().st_mode) == 0o600
    assert key.read_text().startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
    assert key.with_name("id_ed25519.pub").read_text().strip() == line
    ssh_keys.save(ssh_keys.new())  # a new code replaces it
    assert key.with_name("id_ed25519.pub").read_text().strip() != line


def test_authorize_replaces_the_last_phone_key(tmp_path):
    keys = tmp_path / ".ssh" / "authorized_keys"
    keys.parent.mkdir()
    keys.write_text("ssh-ed25519 AAAAmine jdoe@laptop\nssh-ed25519 AAAAold hpc-hub-phone")  # no last newline

    def run(line):
        subprocess.run(["sh", "-c", ssh_keys.authorize_command(line)], env={"HOME": str(tmp_path)}, check=True)

    run("ssh-ed25519 AAAAnew hpc-hub-phone")
    assert keys.read_text() == "ssh-ed25519 AAAAmine jdoe@laptop\nssh-ed25519 AAAAnew hpc-hub-phone\n"
    run("ssh-ed25519 AAAAnew hpc-hub-phone")
    assert keys.read_text().count("hpc-hub-phone") == 1
    assert not (tmp_path / ".ssh" / "authorized_keys.hpchub").exists()
