import io
import json
import socket
import sys
import threading

from hpc_hub.core import ssh_bridge


class Std:
    def __init__(self):
        self.buffer = io.BytesIO()


def _streams(monkeypatch):
    out, err = Std(), Std()
    monkeypatch.setattr(sys, "stdout", out)
    monkeypatch.setattr(sys, "stderr", err)
    return out.buffer, err.buffer


def _backend(frames: list[bytes]) -> tuple[int, dict]:
    """A one-shot backend on a free port: reads the header, sends frames, closes."""
    server = socket.create_server(("127.0.0.1", 0))
    got = {}

    def serve():
        conn, _ = server.accept()
        with conn, server:
            got["header"] = json.loads(conn.makefile("rb").readline())
            conn.sendall(b"".join(frames))

    threading.Thread(target=serve, daemon=True).start()
    return server.getsockname()[1], got


def test_copy_passes_output_and_the_exit_code(monkeypatch):
    out, err = _streams(monkeypatch)
    monkeypatch.setenv(ssh_bridge.TOKEN_ENV, "s3cret")
    port, got = _backend([ssh_bridge.frame(b"o", b"done\n"), ssh_bridge.frame(b"e", b"warn\n"),
                          ssh_bridge.frame(b"x", b"3")])
    assert ssh_bridge.main([str(port), "copy", "a", ":b"]) == 3
    assert got["header"] == {"token": "s3cret", "op": "copy", "args": ["a", ":b"]}
    assert out.getvalue() == b"done\n" and err.getvalue() == b"warn\n"


def test_a_backend_that_hangs_up_is_a_broken_connection(monkeypatch):
    _, err = _streams(monkeypatch)
    port, _ = _backend([ssh_bridge.frame(b"o", b"partial")])
    assert ssh_bridge.main([str(port), "copy", "a", "b"]) == 255
    assert b"broke" in err.getvalue()


def test_usage_and_no_backend(monkeypatch):
    _, err = _streams(monkeypatch)
    assert ssh_bridge.main(["exec"]) == 2 and b"usage" in err.getvalue()
    with socket.create_server(("127.0.0.1", 0)) as s:
        port = s.getsockname()[1]
    assert ssh_bridge.main([str(port), "exec", "true"]) == 255 and b"Not connected" in err.getvalue()


def test_argv_runs_this_file_alone():
    argv = ssh_bridge.argv(4000, "exec", "ls")
    assert argv[1] == "-I" and argv[2].endswith("ssh_bridge.py") and argv[3:] == ["4000", "exec", "ls"]
