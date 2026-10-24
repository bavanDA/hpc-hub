"""A stand-in for `ssh host command` and `scp` when the login is an asyncssh connection inside the backend
(Windows, see ssh_async.py): code that runs ssh.argv(...) as a local process gets this instead, and it runs the
command on that connection through a loopback socket, passing stdin, stdout, stderr and the exit code along.

Stdlib only: the backend runs it as `python -I ssh_bridge.py PORT exec COMMAND` (or `PORT copy SRC DST`), and
the frozen backend as `hpc-hub-backend --ssh-bridge PORT ...`. The socket only answers with the backend's secret,
which children get through the environment (never on the command line).

The wire: one JSON line {"token", "op", "args"}, then frames of one kind byte, a 4-byte big-endian length and
the data. Here to there: i (stdin), c (stdin ended). There to here: o (stdout), e (stderr), x (exit code).
"""

import json
import os
import socket
import struct
import sys
import threading
from pathlib import Path

TOKEN_ENV = "HPC_HUB_SSH_BRIDGE"
FLAG = "--ssh-bridge"
HEAD = struct.Struct(">cI")
CHUNK = 65536


def frame(kind: bytes, data: bytes = b"") -> bytes:
    return HEAD.pack(kind, len(data)) + data


def argv(port: int, *args: str) -> list[str]:
    """Command line that runs args ("exec", command / "copy", src, dst) through the backend on port."""
    if getattr(sys, "frozen", False):
        return [sys.executable, FLAG, str(port), *args]
    return [sys.executable, "-I", str(Path(__file__).resolve()), str(port), *args]


def _pump_stdin(sock: socket.socket) -> None:
    try:
        while chunk := os.read(0, CHUNK):
            sock.sendall(frame(b"i", chunk))
    except OSError:
        pass
    try:
        sock.sendall(frame(b"c"))
    except OSError:
        pass


def main(args: list[str]) -> int:
    err = sys.stderr.buffer
    if len(args) < 2 or not args[0].isdigit():
        err.write(b"usage: ssh_bridge.py PORT exec COMMAND | PORT copy SRC DST\n")
        return 2
    port, op, rest = int(args[0]), args[1], args[2:]
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=10)
    except OSError:
        err.write(b"Not connected to the cluster\n")
        return 255
    with sock:
        sock.settimeout(None)
        header = {"token": os.environ.get(TOKEN_ENV, ""), "op": op, "args": rest}
        sock.sendall(json.dumps(header).encode() + b"\n")
        if op == "exec":
            threading.Thread(target=_pump_stdin, args=(sock,), daemon=True).start()
        out, reader = sys.stdout.buffer, sock.makefile("rb")
        try:
            while len(head := reader.read(HEAD.size)) == HEAD.size:
                kind, size = HEAD.unpack(head)
                data = reader.read(size)
                if kind == b"o":
                    out.write(data)
                    out.flush()
                elif kind == b"e":
                    err.write(data)
                    err.flush()
                elif kind == b"x":
                    return int(data or b"255")
        except OSError:  # our reader went away (a closed pipe) or the backend did
            return 255
    err.write(b"connection to the cluster broke\n")
    return 255


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
