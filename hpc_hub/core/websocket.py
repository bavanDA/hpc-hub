"""A small WebSocket client (RFC 6455), enough for Chrome's DevTools on this computer: text messages over plain
TCP, no extensions. The standard library has none, and HPC Hub installs nothing extra for it."""

import base64
import hashlib
import os
import socket
import struct

GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
TEXT, CLOSE, PING, PONG = 0x1, 0x8, 0x9, 0xA


class WebSocketError(OSError):
    pass


class Closed(WebSocketError):
    """The other side closed the connection."""


class WebSocket:
    def __init__(self, host: str, port: int, path: str, timeout: float = 10):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.buf, self.parts = b"", b""
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
                          .encode())
        while b"\r\n\r\n" not in self.buf:
            self._read()
        head, self.buf = self.buf.split(b"\r\n\r\n", 1)
        status, *lines = head.decode("latin-1").split("\r\n")
        headers = {k.strip().lower(): v.strip() for k, _, v in (line.partition(":") for line in lines)}
        want = base64.b64encode(hashlib.sha1(key.encode() + GUID).digest()).decode()
        if status.split(" ")[1:2] != ["101"] or headers.get("sec-websocket-accept") != want:
            self.sock.close()
            raise WebSocketError(f"No websocket: {status}")

    def send(self, text: str) -> None:
        self._frame(TEXT, text.encode())

    def recv(self, timeout: float) -> str | None:
        """The next text message, or None if none came within timeout seconds."""
        self.sock.settimeout(max(timeout, 0.001))
        while True:
            frame = self._parse()
            if frame is None:
                try:
                    self._read()
                except TimeoutError:
                    return None
                continue
            fin, op, data = frame
            if op == PING:
                self._frame(PONG, data)
            elif op == CLOSE:
                raise Closed("closed")
            elif op != PONG:
                self.parts += data  # TEXT, or a continuation of it
                if fin:
                    text, self.parts = self.parts.decode(errors="replace"), b""
                    return text

    def close(self) -> None:
        try:
            self._frame(CLOSE, b"")
        except OSError:
            pass
        self.sock.close()

    def _read(self) -> None:
        chunk = self.sock.recv(1 << 16)
        if not chunk:
            raise Closed("closed")
        self.buf += chunk

    def _parse(self) -> tuple[bool, int, bytes] | None:
        """One whole frame off the buffer, or None until enough has come. Servers don't mask theirs."""
        b = self.buf
        if len(b) < 2:
            return None
        size, at = b[1] & 0x7F, 2
        if size == 126:
            if len(b) < 4:
                return None
            size, at = struct.unpack(">H", b[2:4])[0], 4
        elif size == 127:
            if len(b) < 10:
                return None
            size, at = struct.unpack(">Q", b[2:10])[0], 10
        if len(b) < at + size:
            return None
        self.buf = b[at + size:]
        return bool(b[0] & 0x80), b[0] & 0x0F, b[at:at + size]

    def _frame(self, op: int, data: bytes) -> None:
        """Clients mask every frame they send."""
        n = len(data)
        head = bytes([0x80 | op]) + (bytes([0x80 | n]) if n < 126 else struct.pack(">BH", 0xFE, n) if n < 1 << 16
                                     else struct.pack(">BQ", 0xFF, n))
        mask = os.urandom(4)
        self.sock.sendall(head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))
