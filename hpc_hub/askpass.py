"""SSH_ASKPASS client: forwards ssh's prompt to the running app. Stdlib only."""

import json
import os
import socket
import sys


def main() -> int:
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""
    path = os.environ.get("HPC_HUB_ASKPASS_SOCK")
    token = os.environ.get("HPC_HUB_ASKPASS_TOKEN")
    if not path or not token:
        return 1
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(600)
            s.connect(path)
            s.sendall(json.dumps({"token": token, "prompt": prompt}).encode() + b"\n")
            reply = json.loads(s.makefile("rb").readline() or b"{}")
    except (OSError, ValueError):
        return 1
    if not reply.get("ok"):
        return 1
    sys.stdout.write(reply.get("answer", "") + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
