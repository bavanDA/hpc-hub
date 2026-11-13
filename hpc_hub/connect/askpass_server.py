"""Unix socket that answers askpass requests on behalf of a connecting session.

Windows has no such socket (nor an askpass helper ssh could run): there SSH is asyncssh, which calls the
session's handler directly. The app's sign-in window (app/src-tauri/src/sso.rs) still needs the saved login, so on
Windows the server listens on a port of 127.0.0.1 instead, and the one-time token is what lets a caller in: the
address is "tcp:127.0.0.1:<port>". The app's web page can't use it (a browser only speaks HTTP to a port, and a
request that isn't one JSON line gets no answer), and another program would need the token."""

import hmac
import json
import os
import secrets
import socket
import struct
import threading
from collections.abc import Callable

from ..core.paths import ASKPASS_BIN, WINDOWS, runtime_dir

# Handler gets the prompt text, returns the answer or None to refuse.
Handler = Callable[[str], str | None]


def peer_uid(conn: socket.socket) -> int | None:
    """Who is on the other end: SO_PEERCRED on Linux, LOCAL_PEERCRED on macOS. None: can't tell, so refuse."""
    if hasattr(socket, "SO_PEERCRED"):
        return struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))[1]
    if hasattr(socket, "LOCAL_PEERCRED"):  # struct xucred: version, uid, ngroups, 16 groups; level 0 is SOL_LOCAL
        return struct.unpack_from("2I", conn.getsockopt(0, socket.LOCAL_PEERCRED, 76))[1]
    return None


class AskpassServer:
    def __init__(self, name: str = "askpass.sock"):
        self.path = runtime_dir() / name
        self._handlers: dict[str, Handler] = {}
        self._lock = threading.Lock()
        self._tcp = False
        self._sock: socket.socket | None = None
        self.address = str(self.path)  # where a caller connects: the socket's path, or "tcp:127.0.0.1:<port>"

    def start(self, tcp: bool | None = None) -> None:
        """tcp: listen on 127.0.0.1 instead of a Unix socket; the default is to on Windows only."""
        if WINDOWS if tcp is None else tcp:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("127.0.0.1", 0))
            sock.listen(8)
            self._sock, self._tcp = sock, True
            self.address = f"tcp:127.0.0.1:{sock.getsockname()[1]}"
            threading.Thread(target=self._accept_loop, daemon=True).start()
            return
        self.path.unlink(missing_ok=True)
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.bind(str(self.path))
        os.chmod(self.path, 0o600)
        sock.listen(8)
        self._sock = sock
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def stop(self) -> None:
        if self._sock:
            self._sock.close()
            self._sock = None
        if not WINDOWS and not self._tcp:
            self.path.unlink(missing_ok=True)

    def register(self, handler: Handler) -> str:
        token = secrets.token_hex(16)
        with self._lock:
            self._handlers[token] = handler
        return token

    def unregister(self, token: str) -> None:
        with self._lock:
            self._handlers.pop(token, None)

    def env(self, token: str) -> dict:
        env = dict(os.environ)
        if WINDOWS:
            env["HPC_HUB_ASKPASS_TOKEN"] = token
            return env
        env.update(
            SSH_ASKPASS=str(ASKPASS_BIN),
            SSH_ASKPASS_REQUIRE="force",
            HPC_HUB_ASKPASS_SOCK=str(self.path),
            HPC_HUB_ASKPASS_TOKEN=token,
        )
        env.setdefault("DISPLAY", ":0")
        return env

    def _find(self, token: str) -> Handler | None:
        with self._lock:
            for known, handler in self._handlers.items():
                if hmac.compare_digest(known, token):
                    return handler
        return None

    def _accept_loop(self) -> None:
        while self._sock:
            try:
                conn, _ = self._sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn: socket.socket) -> None:
        with conn:
            if not self._tcp and peer_uid(conn) != os.getuid():
                return
            conn.settimeout(10)
            try:
                line = conn.makefile("rb").readline(8192)
                if not line.startswith(b"{"):
                    return  # an HTTP request or anything else: no answer
                req = json.loads(line)
            except (ValueError, OSError):
                return
            if not isinstance(req, dict):
                return
            handler = self._find(str(req.get("token", "")))
            answer = handler(str(req.get("prompt", ""))) if handler else None
            reply = {"ok": answer is not None, "answer": answer or ""}
            conn.sendall(json.dumps(reply).encode() + b"\n")
