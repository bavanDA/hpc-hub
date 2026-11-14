"""The Desktop's local bridge: a WebSocket viewer on one side, the VNC port (forwarded here) on the other."""

import base64
import os
import socket
import struct
import threading

from hpc_hub.compute import vnc_bridge


def echo_server() -> tuple[int, threading.Event]:
    """A stand-in VNC server: answers every byte it gets with the same bytes."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    stop = threading.Event()

    def run():
        conn, _ = srv.accept()
        with conn:
            conn.sendall(b"RFB 003.008\n")  # VNC speaks first
            while data := conn.recv(65536):
                conn.sendall(data)
        srv.close()
    threading.Thread(target=run, daemon=True).start()
    return srv.getsockname()[1], stop


def upgrade(port: int, path: str, protocol: str = "binary") -> tuple[socket.socket, bytes]:
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET /{path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: {protocol}\r\n\r\n")
              .encode())
    head = b""
    while b"\r\n\r\n" not in head:
        head += s.recv(1)
    return s, head


def masked(payload: bytes) -> bytes:
    """A viewer's frame: binary, masked as browsers must."""
    mask = os.urandom(4)
    n = len(payload)
    head = struct.pack("!BB", 0x82, 0x80 | n) if n < 126 else struct.pack("!BBH", 0x82, 0x80 | 126, n)
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def test_viewer_and_vnc_talk_through_the_bridge():
    port, _ = echo_server()
    bridge = vnc_bridge.Bridge("127.0.0.1", port)
    try:
        assert bridge.url == f"ws://127.0.0.1:{bridge.port}/{bridge.token}"
        s, head = upgrade(bridge.port, bridge.token)
        with s:
            assert head.startswith(b"HTTP/1.1 101") and b"Sec-WebSocket-Protocol: binary" in head
            assert vnc_bridge.read_frame(s) == (2, b"RFB 003.008\n")
            big = os.urandom(70000)  # a frame with the 8-byte length
            s.sendall(masked(b"hello") + masked(big[:60000]))
            got = b""
            while len(got) < 60005:
                got += vnc_bridge.read_frame(s)[1]
            assert got == b"hello" + big[:60000]
    finally:
        bridge.close()


def test_a_wrong_token_or_plain_request_gets_nothing():
    port, _ = echo_server()
    bridge = vnc_bridge.Bridge("127.0.0.1", port)
    try:
        s, head = upgrade(bridge.port, "guess")
        s.close()
        assert head.startswith(b"HTTP/1.1 403")
        plain = socket.create_connection(("127.0.0.1", bridge.port), timeout=5)
        plain.sendall(f"GET /{bridge.token} HTTP/1.1\r\nHost: x\r\n\r\n".encode())  # no upgrade: not a viewer
        assert plain.recv(100).startswith(b"HTTP/1.1 403")
        plain.close()
    finally:
        bridge.close()


def test_it_listens_on_this_computer_only():
    port, _ = echo_server()
    bridge = vnc_bridge.Bridge("127.0.0.1", port)
    try:
        assert bridge.sock.getsockname()[0] == "127.0.0.1"
    finally:
        bridge.close()


def test_frames_of_every_length():
    for n in (0, 125, 126, 65535, 65536):
        data = vnc_bridge.frame(b"x" * n)
        a, b = socket.socketpair()
        with a, b:
            threading.Thread(target=a.sendall, args=(data,), daemon=True).start()
            assert vnc_bridge.read_frame(b) == (2, b"x" * n)
