import json
import subprocess
import time

from hpc_hub.agents import lock


class LocalSsh:
    """Runs the 'cluster' commands here, in a fake home."""

    def run(self, command, timeout=60):
        return subprocess.run(["bash", "-c", command], capture_output=True, text=True, timeout=timeout)

    def argv(self, command):
        return ["bash", "-c", command]


def test_install_configure_uninstall(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    ssh = LocalSsh()
    assert lock.status(ssh) == {}
    secret = lock.new_secret()
    lock.install(ssh, secret)
    assert (tmp_path / ".config" / "remote-lock" / "secret").read_text().strip() == secret
    settings = json.loads((tmp_path / ".claude" / "settings.json").read_text())
    assert "remote-lock" in json.dumps(settings["hooks"]["UserPromptSubmit"])
    lock.configure(ssh, 0, 4, False, True)
    st = lock.status(ssh)
    assert st["set_up"] and st["config"] == {"minutes": 0, "tries": 4, "logout": False, "scancel": True,
                                             "remote_only": True}
    lock.reset(ssh)
    lock.uninstall(ssh)
    assert not lock.status(ssh)["set_up"]


def test_code_ok():
    secret = lock.new_secret()
    now = lock.rl.code_at(secret, int(time.time() // 30))
    assert lock.code_ok(secret, now[:3] + " " + now[3:]) and not lock.code_ok(secret, "abc")
