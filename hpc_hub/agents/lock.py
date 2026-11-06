"""remote-lock (github.com/bavanDA/remote-lock, copy in guard_files): Claude takes no messages until you
start a session with the code from your authenticator app."""

import json
import subprocess
import time

from ..core.ssh import SshMaster
from .guard_files import remote_lock as rl
from .permissions import FILES, _write

BIN = ".local/bin/remote-lock"
new_secret = rl.new_secret
otp_uri = rl.otp_uri


def code_ok(secret: str, code: str) -> bool:
    return rl.code_ok(secret, code.strip().replace(" ", ""), time.time())


def _run(ssh: SshMaster, command: str) -> None:
    res = ssh.run(command)
    if res.returncode != 0:
        raise OSError(res.stderr.strip() or "remote-lock failed")


def _install_bin(ssh: SshMaster) -> str:
    return "mkdir -p ~/.local/bin && " + _write(BIN, (FILES / "remote_lock.py").read_text(), "+x")


def status(ssh: SshMaster) -> dict:
    """remote-lock status --json, or {} when it isn't there."""
    res = ssh.run(f"test -x ~/{BIN} && ~/{BIN} status --json 2>/dev/null; true")
    try:
        return json.loads(res.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {}


def install(ssh: SshMaster, secret: str) -> None:
    _run(ssh, _install_bin(ssh))
    # the secret goes through stdin, so it never shows up in ps on the shared login node
    res = subprocess.run(ssh.argv(f"~/{BIN} setup --stdin"), input=secret + "\n", capture_output=True, text=True,
                         timeout=60)
    if res.returncode != 0:
        raise OSError(res.stderr.strip() or "remote-lock setup failed")


def configure(ssh: SshMaster, minutes: int, tries: int, logout: bool, scancel: bool) -> None:
    on = lambda b: "on" if b else "off"  # noqa: E731
    _run(ssh, f"{_install_bin(ssh)} && ~/{BIN} set minutes={int(minutes)} tries={int(tries)} "
              f"logout={on(logout)} scancel={on(scancel)} >/dev/null")


def reset(ssh: SshMaster) -> None:
    _run(ssh, f"~/{BIN} reset >/dev/null")


def uninstall(ssh: SshMaster) -> None:
    _run(ssh, f"~/{BIN} uninstall >/dev/null")
