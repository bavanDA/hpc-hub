import os
import socket
import subprocess

from hpc_hub.connect.askpass_server import AskpassServer, peer_uid
from hpc_hub.core.paths import ASKPASS_BIN


def run(env, prompt):
    return subprocess.run([str(ASKPASS_BIN), prompt], env=env, capture_output=True, text=True)


def test_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    server = AskpassServer()
    server.start()
    try:
        seen = []
        token = server.register(lambda prompt: seen.append(prompt) or "s3cret")
        out = run(server.env(token), "Password: ")
        assert out.returncode == 0 and out.stdout == "s3cret\n"
        assert seen == ["Password: "]

        bad = run(server.env("wrong"), "Password: ")
        assert bad.returncode == 1 and bad.stdout == ""

        refuse = server.register(lambda prompt: None)
        assert run(server.env(refuse), "x").returncode == 1
    finally:
        server.stop()


def test_peer_is_you():
    a, b = socket.socketpair()
    with a, b:
        assert peer_uid(a) == os.getuid()


def ask_tcp(address: str, line: bytes) -> bytes:
    host, port = address.removeprefix("tcp:").rsplit(":", 1)
    with socket.create_connection((host, int(port)), timeout=5) as c:
        c.sendall(line)
        return c.makefile("rb").readline()


def test_windows_listens_on_loopback_for_the_sign_in_window():
    """Windows has no Unix socket: the sign-in window gets the saved login over 127.0.0.1, with the token."""
    import json
    server = AskpassServer()
    server.start(tcp=True)
    try:
        assert server.address.startswith("tcp:127.0.0.1:")
        token = server.register({"hpc-hub:sso-password": "s3cret"}.get)
        ask = json.dumps({"token": token, "prompt": "hpc-hub:sso-password"}).encode() + b"\n"
        got = json.loads(ask_tcp(server.address, ask))
        assert got == {"ok": True, "answer": "s3cret"}
        wrong = json.loads(ask_tcp(server.address, b'{"token": "guess", "prompt": "hpc-hub:sso-password"}\n'))
        assert wrong == {"ok": False, "answer": ""}
        # what a web page could send (an HTTP request) gets nothing at all
        assert ask_tcp(server.address, f"POST / HTTP/1.1\r\nHost: x\r\n\r\n{token}".encode()) == b""
        assert ask_tcp(server.address, b'["not", "an", "object"]\n') == b""
        server.unregister(token)
        gone = json.loads(ask_tcp(server.address, json.dumps({"token": token, "prompt": "x"}).encode() + b"\n"))
        assert gone["ok"] is False
    finally:
        server.stop()
