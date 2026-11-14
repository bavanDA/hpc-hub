"""The Desktop's viewer (noVNC, in the app) speaks WebSocket; a VNC server speaks plain TCP. This bridge, on this
computer only, turns one into the other: the VNC port is already forwarded here over SSH, and the viewer connects to
ws://127.0.0.1:<port>/<token>. The token is a one-time secret in the path, so a web page open in a browser on this
computer can't reach the desktop through it. Standard library only (RFC 6455, binary frames)."""

import base64
import hashlib
import secrets
import socket
import struct
import threading

GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC11B85"
MAX_HEADER = 16384
CHUNK = 65536


class Bridge:
    """Listens on 127.0.0.1; each viewer that knows the token gets its own connection to target."""

    def __init__(self, target_host: str, target_port: int):
        self.target = (target_host, target_port)
        self.token = secrets.token_urlsafe(24)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(4)
        self.port = self.sock.getsockname()[1]
        self.closed = False
        threading.Thread(target=self._accept, daemon=True, name="vnc-bridge").start()

    @property
    def url(self) -> str:
        return f"ws://127.0.0.1:{self.port}/{self.token}"

    def close(self) -> None:
        self.closed = True
        try:
            self.sock.close()
        except OSError:
            pass

    def _accept(self) -> None:
        while not self.closed:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn: socket.socket) -> None:
        with conn:
            conn.settimeout(10)
            head = _read_head(conn)
            reply = handshake(head, self.token) if head is not None else None
            if reply is None:
                try:
                    conn.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                except OSError:
                    pass
                return
            try:
                vnc = socket.create_connection(self.target, timeout=10)
            except OSError:
                conn.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                return
            conn.sendall(reply)
            conn.settimeout(None)
            vnc.settimeout(None)
            with vnc:
                done = threading.Event()
                threading.Thread(target=_to_viewer, args=(vnc, conn, done), daemon=True).start()
                _to_vnc(conn, vnc, done)
                done.wait(5)


def _read_head(conn: socket.socket) -> bytes | None:
    data = b""
    while b"\r\n\r\n" not in data:
        try:
            got = conn.recv(4096)
        except OSError:
            return None
        if not got or len(data) > MAX_HEADER:
            return None
        data += got
    return data


def handshake(head: bytes, token: str) -> bytes | None:
    """The 101 answer to a WebSocket upgrade for /<token>; None for anything else."""
    try:
        lines = head.decode("latin-1").split("\r\n")
    except UnicodeDecodeError:
        return None
    parts = lines[0].split(" ")
    if len(parts) != 3 or parts[0] != "GET" or parts[1].lstrip("/").split("?")[0] != token:
        return None
    fields = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        fields[name.strip().lower()] = value.strip()
    key = fields.get("sec-websocket-key", "")
    if "websocket" not in fields.get("upgrade", "").lower() or not key:
        return None
    accept = base64.b64encode(hashlib.sha1(key.encode() + GUID).digest()).decode()
    reply = ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
             f"Sec-WebSocket-Accept: {accept}\r\n")
    if "binary" in [p.strip() for p in fields.get("sec-websocket-protocol", "").split(",")]:
        reply += "Sec-WebSocket-Protocol: binary\r\n"  # noVNC asks for it
    return (reply + "\r\n").encode()


def frame(payload: bytes, opcode: int = 2) -> bytes:
    """One unmasked frame (server to viewer)."""
    n = len(payload)
    if n < 126:
        head = struct.pack("!BB", 0x80 | opcode, n)
    elif n < 65536:
        head = struct.pack("!BBH", 0x80 | opcode, 126, n)
    else:
        head = struct.pack("!BBQ", 0x80 | opcode, 127, n)
    return head + payload


def _exactly(conn: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        got = conn.recv(n - len(buf))
        if not got:
            raise ConnectionError("closed")
        buf += got
    return buf


def read_frame(conn: socket.socket) -> tuple[int, bytes]:
    """(opcode, payload) of the viewer's next frame, unmasked."""
    b1, b2 = _exactly(conn, 2)
    opcode, n = b1 & 0x0F, b2 & 0x7F
    if n == 126:
        n = struct.unpack("!H", _exactly(conn, 2))[0]
    elif n == 127:
        n = struct.unpack("!Q", _exactly(conn, 8))[0]
    mask = _exactly(conn, 4) if b2 & 0x80 else b""
    data = _exactly(conn, n)
    if mask:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data


def _to_vnc(viewer: socket.socket, vnc: socket.socket, done: threading.Event) -> None:
    try:
        while not done.is_set():
            opcode, data = read_frame(viewer)
            if opcode == 8:  # close
                break
            if opcode == 9:  # ping
                viewer.sendall(frame(data, 10))
            elif opcode in (0, 1, 2):
                vnc.sendall(data)
    except (OSError, ConnectionError):
        pass
    finally:
        done.set()
        _shut(vnc)


def _to_viewer(vnc: socket.socket, viewer: socket.socket, done: threading.Event) -> None:
    try:
        while not done.is_set():
            data = vnc.recv(CHUNK)
            if not data:
                break
            viewer.sendall(frame(data))
    except OSError:
        pass
    finally:
        done.set()
        _shut(viewer)


def _shut(s: socket.socket) -> None:
    try:
        s.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
