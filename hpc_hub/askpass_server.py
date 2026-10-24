"""Unix socket that answers askpass requests on behalf of a connecting session."""

import hmac
import json
import os
import secrets
import socket
import struct
import threading
from collections.abc import Callable

from .core.paths import ASKPASS_BIN, runtime_dir

# Handler gets the prompt text, returns the answer or None to refuse.
Handler = Callable[[str], str | None]


class AskpassServer:
    def __init__(self):
        self.path = runtime_dir() / "askpass.sock"
        self._handlers: dict[str, Handler] = {}
        self._lock = threading.Lock()
        self._sock: socket.socket | None = None

    def start(self) -> None:
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
            creds = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
            _, uid, _ = struct.unpack("3i", creds)
            if uid != os.getuid():
                return
            try:
                req = json.loads(conn.makefile("rb").readline() or b"{}")
            except ValueError:
                return
            handler = self._find(str(req.get("token", "")))
            answer = handler(str(req.get("prompt", ""))) if handler else None
            reply = {"ok": answer is not None, "answer": answer or ""}
            conn.sendall(json.dumps(reply).encode() + b"\n")
