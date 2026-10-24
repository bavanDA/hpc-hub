"""Entry point of the frozen backend: the same as python -m hpc_hub.api.

With --ssh-bridge it is the bridge instead (hpc_hub/core/ssh_bridge.py): the asyncssh login runs local ssh
command lines through it, since a frozen app has no python to start that file with."""

import sys

if sys.argv[1:2] == ["--ssh-bridge"]:
    from hpc_hub.core import ssh_bridge

    sys.exit(ssh_bridge.main(sys.argv[2:]))

if sys.platform == "win32":  # the UI's JSON is UTF-8 (passwords, file names), not the console's code page
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

import hpc_hub.api.__main__  # noqa: E402, F401
