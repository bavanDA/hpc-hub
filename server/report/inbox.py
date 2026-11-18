"""The bug report inbox behind report.hpchub.staylazy.app: the app posts a report the person has read and sent; only
the owner can read them back, with the key in KEY_FILE. Standard library only. Reports are untrusted text: they are
stored and listed, never run or rendered here.

The bug board (/report/bugs, board.html and board.js beside this file) groups reports into bugs: each report gets
one label, so two people describing the same bug differently count as one bug. For each it shows how many reports
and people, on which systems and HPC Hub versions, and whether it is fixed (in which version, by which test). The
page itself holds nothing: its data comes from /report/board with the owner's key."""

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
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
HERE = Path(__file__).resolve().parent

_db_lock = threading.Lock()


def db() -> sqlite3.Connection:
    STATE.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(STATE / "reports.db", check_same_thread=False)
    con.execute("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, received INTEGER, who TEXT, kind TEXT, "
                "text TEXT, error TEXT, log TEXT, page TEXT, app TEXT, platform TEXT, os TEXT, contact TEXT, "
                "shot INTEGER, done INTEGER DEFAULT 0)")
    con.execute("CREATE INDEX IF NOT EXISTS by_who ON reports (who, received)")
    if "label" not in [r[1] for r in con.execute("PRAGMA table_info(reports)")]:
        con.execute("ALTER TABLE reports ADD COLUMN label TEXT DEFAULT ''")
    con.execute("CREATE TABLE IF NOT EXISTS bugs (id TEXT PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', "
                "fixed_in TEXT DEFAULT '', test TEXT DEFAULT '', note TEXT DEFAULT '', created INTEGER)")
    con.commit()
    return con


LABEL = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")
STATUSES = ("open", "fixed", "wontfix")
BUG_LIMITS = {"title": 200, "fixed_in": 40, "test": 200, "note": 2000}


def save_bug(con: sqlite3.Connection, body: dict) -> dict:
    """Make or change a bug: its label (id), title, status, the version that fixed it, the test that keeps it fixed."""
    bug_id = body.get("id", "")
    if not isinstance(bug_id, str) or not LABEL.match(bug_id):
        raise ValueError("id: a label like windows-ssh-key (a-z, 0-9 and -)")
    old = con.execute("SELECT title, status, fixed_in, test, note FROM bugs WHERE id=?", (bug_id,)).fetchone()
    bug = dict(zip(["title", "status", "fixed_in", "test", "note"], old or ["", "open", "", "", ""]))
    for k, n in BUG_LIMITS.items():
        if k in body:
            if not isinstance(body[k], str):
                raise ValueError(f"{k} must be text")
            bug[k] = body[k].strip()[:n]
    if "status" in body:
        if body["status"] not in STATUSES:
            raise ValueError(f"status is one of {', '.join(STATUSES)}")
        bug["status"] = body["status"]
    if not bug["title"]:
        raise ValueError("title: say what the bug is")
    con.execute("INSERT INTO bugs (id, title, status, fixed_in, test, note, created) VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, "
                "fixed_in=excluded.fixed_in, test=excluded.test, note=excluded.note",
                (bug_id, bug["title"], bug["status"], bug["fixed_in"], bug["test"], bug["note"], int(time.time())))
    con.execute("UPDATE reports SET done=? WHERE label=?", (int(bug["status"] != "open"), bug_id))
    con.commit()
    return {"id": bug_id, **bug}


def label(con: sqlite3.Connection, body: dict) -> dict:
    """Put reports under a bug ("" takes them out). The bug must exist."""
    reports, bug_id = body.get("reports"), body.get("bug", "")
    if isinstance(body.get("report"), str):
        reports = [body["report"]]
    if not isinstance(reports, list) or not reports or not all(isinstance(r, str) for r in reports):
        raise ValueError("report: the report's id (or reports: a list of them)")
    if not isinstance(bug_id, str):
        raise ValueError("bug must be text")
    status = "open"
    if bug_id:
        row = con.execute("SELECT status FROM bugs WHERE id=?", (bug_id,)).fetchone()
        if not row:
            raise ValueError(f"No bug labeled {bug_id}: make it first")
        status = row[0]
    found = 0
    for rid in reports:
        found += con.execute("UPDATE reports SET label=?, done=? WHERE id=?",
                             (bug_id, int(bool(bug_id) and status != "open"), rid)).rowcount
    con.commit()
    if not found:
        raise ValueError("No such report")
    return {"labeled": found, "bug": bug_id}


def _counts(values) -> list[list]:
    """[[value, how many], ...], most first."""
    seen: dict[str, int] = {}
    for v in values:
        v = (v or "").strip() or "unknown"
        seen[v] = seen.get(v, 0) + 1
    return sorted(([k, n] for k, n in seen.items()), key=lambda x: (-x[1], x[0]))


def board(con: sqlite3.Connection) -> dict:
    """Every bug with its reports, people, systems and versions; and the reports not labeled yet."""
    keys = ["id", "received", "who", "kind", "text", "error", "page", "app", "platform", "os", "shot", "label"]
    rows = [dict(zip(keys, r)) for r in con.execute(
        f"SELECT {', '.join(keys)} FROM reports ORDER BY received DESC")]

    def brief(r: dict) -> dict:
        said = (r["text"] or r["error"] or "").strip()
        return {"id": r["id"], "received": r["received"], "kind": r["kind"], "said": said[:600], "page": r["page"],
                "app": r["app"], "platform": r["platform"], "os": r["os"], "shot": r["shot"]}

    bugs = []
    for b in con.execute("SELECT id, title, status, fixed_in, test, note, created FROM bugs"):
        bug = dict(zip(["id", "title", "status", "fixed_in", "test", "note", "created"], b))
        mine = [r for r in rows if r["label"] == bug["id"]]
        bug.update(reports=len(mine), people=len({r["who"] for r in mine}),
                   systems=_counts(r["os"] or r["platform"] for r in mine),
                   versions=_counts(r["app"] for r in mine),
                   first=min((r["received"] for r in mine), default=None),
                   last=max((r["received"] for r in mine), default=None),
                   items=[brief(r) for r in mine])
        bugs.append(bug)
    bugs.sort(key=lambda b: (b["status"] != "open", -b["reports"], -(b["last"] or 0)))
    loose = [brief(r) for r in rows if not r["label"]]
    return {"bugs": bugs, "unlabeled": loose, "reports": len(rows),
            "systems": _counts(r["os"] or r["platform"] for r in rows),
            "versions": _counts(r["app"] for r in rows)}


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

    def file(self, name: str, kind: str) -> None:
        """The board's page or script (no data in them)."""
        data = (HERE / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; "
                         "connect-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'none'; "
                         "frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def owner_post(self) -> None:
        """The board's changes: a bug (/v1/bugs) or a report's label (/v1/label)."""
        if not self.owner():
            return self.answer(401, {"error": "Not here"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 100_000:
            return self.answer(413, {"error": "Too big"})
        try:
            body = json.loads(self.rfile.read(n))
            if not isinstance(body, dict):
                raise ValueError("Send a JSON object")
            with _db_lock:
                done = save_bug(self.con, body) if self.path == "/v1/bugs" else label(self.con, body)
        except (ValueError, UnicodeDecodeError) as e:
            return self.answer(400, {"error": str(e)})
        self.answer(200, done)

    def do_POST(self):
        if self.path in ("/v1/bugs", "/v1/label"):
            return self.owner_post()
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
        if self.path == "/v1/bugs":
            return self.file("board.html", "text/html; charset=utf-8")
        if self.path in ("/v1/board.js", "/v1/board.css"):
            name = self.path.split("/")[-1]
            return self.file(name, "text/javascript" if name.endswith(".js") else "text/css")
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
                                    "shot, done, label FROM reports ORDER BY received DESC LIMIT 200").fetchall()
            keys = ["id", "received", "kind", "text", "error", "log", "page", "app", "platform", "os", "contact",
                    "shot", "done", "label"]
            return self.answer(200, [dict(zip(keys, r)) for r in rows])
        if self.path == "/v1/board":
            with _db_lock:
                return self.answer(200, board(self.con))
        self.answer(404, {"error": "Not here"})


def main() -> None:
    Inbox.con = db()
    ThreadingHTTPServer(("127.0.0.1", PORT), Inbox).serve_forever()


if __name__ == "__main__":
    main()
