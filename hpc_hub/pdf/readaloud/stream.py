"""Serving the MP3 over loopback lets the player start at once and seek with Range requests."""

import re
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


def span(header: str | None, size: int) -> tuple[int, int] | None:
    """The first and last byte a Range header asks for, (0, size - 1) without one, None when it can't be met."""
    if not header:
        return (0, size - 1) if size else None
    m = RANGE.match(header.strip())
    if not m or not (m[1] or m[2]):
        return None
    if m[1]:
        first, last = int(m[1]), int(m[2]) if m[2] else size - 1
    else:  # the last n bytes
        first, last = max(0, size - int(m[2])), size - 1
    last = min(last, size - 1)
    return (first, last) if first <= last else None


class Server:

    def __init__(self, find: Callable[[str], Path | None]):
        self.find = find
        self._lock = threading.Lock()
        self._http: ThreadingHTTPServer | None = None

    def url(self, token: str) -> str:
        with self._lock:
            if self._http is None:
                self._http = ThreadingHTTPServer(("127.0.0.1", 0), _handler(self.find))
                self._http.daemon_threads = True
                threading.Thread(target=self._http.serve_forever, daemon=True, name="readaloud-stream").start()
            port = self._http.server_address[1]
        return f"http://127.0.0.1:{port}/audio/{token}.mp3"

    def close(self) -> None:
        with self._lock:
            if self._http:
                self._http.shutdown()
                self._http.server_close()
                self._http = None


def _handler(find: Callable[[str], Path | None]) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:
            pass

        def do_HEAD(self) -> None:
            self._send(body=False)

        def do_GET(self) -> None:
            self._send(body=True)

        def _send(self, body: bool) -> None:
            m = re.fullmatch(r"/audio/([0-9a-f]+)\.mp3", self.path)
            path = find(m[1]) if m else None
            if path is None or not path.is_file():
                self.send_error(404)
                return
            size = path.stat().st_size
            got = span(self.headers.get("Range"), size)
            if got is None:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            first, last = got
            self.send_response(206 if self.headers.get("Range") else 200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(last - first + 1))
            if self.headers.get("Range"):
                self.send_header("Content-Range", f"bytes {first}-{last}/{size}")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if not body:
                return
            try:
                with open(path, "rb") as f:
                    f.seek(first)
                    left = last - first + 1
                    while left > 0:
                        piece = f.read(min(left, 256 * 1024))
                        if not piece:
                            break
                        self.wfile.write(piece)
                        left -= len(piece)
            except (BrokenPipeError, ConnectionResetError):
                pass  # the player seeked or stopped: it drops the connection
    return Handler

