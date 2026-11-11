"""The bug report inbox behind report.hpchub.staylazy.app: the app posts a report the person has read and sent; only
the owner can read them back, with the key in KEY_FILE. Standard library only. Reports are untrusted text: they are
stored and listed, never run or rendered here."""

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATE = Path(os.environ.get("STATE_DIRECTORY", "/var/lib/hpchub-report"))
KEY_FILE = Path(os.environ.get("REPORT_KEY_FILE", "/etc/hpchub-report/key"))
PORT = int(os.environ.get("REPORT_PORT", "8098"))
MAX_BODY = 4_000_000
MAX_SHOT = 2_500_000  # bytes of PNG
LIMITS = {"kind": 10, "text": 4000, "error": 8000, "log": 20000, "page": 100, "app": 40, "platform": 40, "os": 80,
          "contact": 200}
PER_DAY = 40  # reports from one address in a day
FULL = 500_000_000  # bytes the inbox may use before it turns reports away
PNG = "data:image/png;base64,"

_db_lock = threading.Lock()


def db() -> sqlite3.Connection:
    STATE.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(STATE / "reports.db", check_same_thread=False)
    con.execute("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, received INTEGER, who TEXT, kind TEXT, "
                "text TEXT, error TEXT, log TEXT, page TEXT, app TEXT, platform TEXT, os TEXT, contact TEXT, "
                "shot INTEGER, done INTEGER DEFAULT 0)")
    con.execute("CREATE INDEX IF NOT EXISTS by_who ON reports (who, received)")
    return con


def used() -> int:
    return sum(f.stat().st_size for f in STATE.rglob("*") if f.is_file())


def clean(body: dict) -> dict:
    """The fields we keep, as text within their limits; ValueError for a report that isn't one."""
    out = {}
    for k, n in LIMITS.items():
        v = body.get(k, "")
        if not isinstance(v, str):
            raise ValueError(f"{k} must be text")
        out[k] = v[:n]
    if out["kind"] not in ("error", "user"):
        raise ValueError("kind must be error or user")
    if not (out["text"].strip() or out["error"].strip()):
        raise ValueError("Say what happened")
    return out


def screenshot(body: dict) -> bytes | None:
    shot = body.get("screenshot")
    if not shot:
        return None
    if not isinstance(shot, str) or not shot.startswith(PNG):
        raise ValueError("screenshot must be a PNG data URL")
    try:
        raw = base64.b64decode(shot[len(PNG):], validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("screenshot is not valid base64")
    if len(raw) > MAX_SHOT or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("screenshot is not a PNG under 2.5 MB")
    return raw


class Inbox(BaseHTTPRequestHandler):
    server_version = "hpchub-report"
    sys_version = ""
    con: sqlite3.Connection

    def log_message(self, fmt, *args):  # no addresses or bodies in the journal
        pass

    def answer(self, code: int, data: dict | list) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def who(self) -> str:
        """The sender's address as nginx saw it, hashed with today's date so it is never kept as is."""
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        return hashlib.sha256(f"{time.strftime('%Y-%m-%d')}|{ip}".encode()).hexdigest()[:16]

    def owner(self) -> bool:
        key = KEY_FILE.read_text().strip() if KEY_FILE.exists() else ""
        given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        return bool(key) and hmac.compare_digest(given, key)

    def do_POST(self):
        if self.path != "/v1/reports":
            return self.answer(404, {"error": "Not here"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.answer(413, {"error": "The report is too big"})
        try:
            body = json.loads(self.rfile.read(n))
            if not isinstance(body, dict):
                raise ValueError("Send a JSON object")
            fields, shot = clean(body), screenshot(body)
        except (ValueError, UnicodeDecodeError) as e:
            return self.answer(400, {"error": str(e)})
        who, now = self.who(), int(time.time())
        with _db_lock:
            if self.con.execute("SELECT count(*) FROM reports WHERE who=? AND received>?",
                                (who, now - 86400)).fetchone()[0] >= PER_DAY:
                return self.answer(429, {"error": "Too many reports today. Try again tomorrow"})
            if used() > FULL:
                return self.answer(507, {"error": "The inbox is full. Try again later"})
            rid = time.strftime("%Y%m%d-") + secrets.token_hex(3)
            if shot:
                (STATE / "shots").mkdir(exist_ok=True)
                (STATE / "shots" / f"{rid}.png").write_bytes(shot)
            self.con.execute("INSERT INTO reports (id, received, who, kind, text, error, log, page, app, platform, os, "
                             "contact, shot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                             (rid, now, who, *[fields[k] for k in LIMITS], int(bool(shot))))
            self.con.commit()
        self.answer(201, {"id": rid})

    def do_GET(self):
        if self.path == "/health":
            return self.answer(200, {"ok": True})
        if not self.owner():
            return self.answer(401 if self.path.startswith("/v1/") else 404, {"error": "Not here"})
        if self.path.startswith("/v1/reports/") and self.path.endswith("/screenshot"):
            rid = self.path.split("/")[3]
            f = STATE / "shots" / f"{rid}.png"
            if "/" in rid or ".." in rid or not f.exists():
                return self.answer(404, {"error": "No screenshot"})
            data = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        if self.path.split("?")[0] == "/v1/reports":
            rows = self.con.execute("SELECT id, received, kind, text, error, log, page, app, platform, os, contact, "
                                    "shot, done FROM reports ORDER BY received DESC LIMIT 200").fetchall()
            keys = ["id", "received", "kind", "text", "error", "log", "page", "app", "platform", "os", "contact",
                    "shot", "done"]
            return self.answer(200, [dict(zip(keys, r)) for r in rows])
        self.answer(404, {"error": "Not here"})


def main() -> None:
    Inbox.con = db()
    ThreadingHTTPServer(("127.0.0.1", PORT), Inbox).serve_forever()


if __name__ == "__main__":
    main()
