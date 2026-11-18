"""The report inbox's bug board (server/report/inbox.py): labels group reports into bugs, counted by people,
systems and versions; only the owner's key reads or changes them. Made-up reports only."""

import importlib.util
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

INBOX = Path(__file__).resolve().parents[2] / "server" / "report" / "inbox.py"
KEY = "test-owner-key"


@pytest.fixture
def inbox(tmp_path, monkeypatch):
    (tmp_path / "key").write_text(KEY)
    monkeypatch.setenv("STATE_DIRECTORY", str(tmp_path / "state"))
    monkeypatch.setenv("REPORT_KEY_FILE", str(tmp_path / "key"))
    spec = importlib.util.spec_from_file_location("inbox_under_test", INBOX)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.Inbox.con = mod.db()
    server = ThreadingHTTPServer(("127.0.0.1", 0), mod.Inbox)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", mod
    server.shutdown()


def call(base, path, body=None, key=KEY, ip="192.0.2.1"):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "X-Real-IP": ip,
                                          **({"Authorization": f"Bearer {key}"} if key else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if res.headers.get_content_type() == "application/json" else raw)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def report(base, text, os_name, app, ip):
    code, out = call(base, "/v1/reports", {"kind": "user", "text": text, "os": os_name, "app": app,
                                           "platform": os_name.split()[0].lower()}, key="", ip=ip)
    assert code == 201
    return out["id"]


def test_two_people_saying_one_bug_differently_count_as_one(inbox):
    base, _ = inbox
    a = report(base, "Select needs Shift to copy", "Ubuntu 24.04", "0.2.7-beta.51", "192.0.2.1")
    b = report(base, "can't highlight text in the terminal", "Windows 11", "0.2.7-beta.50", "192.0.2.2")
    c = report(base, "copy only works holding shift", "Ubuntu 24.04", "0.2.7-beta.51", "192.0.2.1")
    other = report(base, "VPN asks for an admin password", "Windows 11", "0.2.7-beta.51", "192.0.2.3")

    assert call(base, "/v1/bugs", {"id": "terminal-drag-select", "title": "Dragging doesn't select text"})[0] == 200
    assert call(base, "/v1/label", {"reports": [a, b, c], "bug": "terminal-drag-select"}) == \
        (200, {"labeled": 3, "bug": "terminal-drag-select"})

    code, board = call(base, "/v1/board")
    assert code == 200 and board["reports"] == 4
    bug = board["bugs"][0]
    assert bug["id"] == "terminal-drag-select" and bug["status"] == "open"
    assert bug["reports"] == 3 and bug["people"] == 2
    assert bug["systems"] == [["Ubuntu 24.04", 2], ["Windows 11", 1]]
    assert bug["versions"] == [["0.2.7-beta.51", 2], ["0.2.7-beta.50", 1]]
    assert [r["id"] for r in board["unlabeled"]] == [other]


def test_fixing_a_bug_marks_its_reports_done(inbox):
    base, mod = inbox
    rid = report(base, "Minimize is far from close", "macOS 15", "0.2.7-beta.51", "192.0.2.9")
    call(base, "/v1/bugs", {"id": "report-minimize", "title": "Minimize far from close"})
    call(base, "/v1/label", {"report": rid, "bug": "report-minimize"})
    code, bug = call(base, "/v1/bugs", {"id": "report-minimize", "status": "fixed", "fixed_in": "0.2.7-beta.51 fix 11",
                                        "test": "app/src/components/e/EDialog.test.tsx"})
    assert code == 200 and bug["title"] == "Minimize far from close"  # what wasn't sent stays
    assert mod.Inbox.con.execute("SELECT done FROM reports WHERE id=?", (rid,)).fetchone()[0] == 1
    board = call(base, "/v1/board")[1]
    assert board["bugs"][0]["fixed_in"] == "0.2.7-beta.51 fix 11"


def test_only_the_owner_reads_or_changes_the_board(inbox):
    base, _ = inbox
    assert call(base, "/v1/board", key="")[0] == 401
    assert call(base, "/v1/board", key="wrong")[0] == 401
    assert call(base, "/v1/bugs", {"id": "x", "title": "y"}, key="")[0] == 401
    assert call(base, "/v1/label", {"report": "x", "bug": ""}, key="wrong")[0] == 401


def test_bad_labels_and_unknown_bugs_are_refused(inbox):
    base, _ = inbox
    rid = report(base, "something", "Windows 11", "0.2.7", "192.0.2.4")
    assert call(base, "/v1/bugs", {"id": "Bad Label!", "title": "x"})[0] == 400
    assert call(base, "/v1/bugs", {"id": "no-title"})[0] == 400
    assert call(base, "/v1/bugs", {"id": "x", "title": "y", "status": "maybe"})[0] == 400
    assert call(base, "/v1/label", {"report": rid, "bug": "never-made"})[0] == 400
    assert call(base, "/v1/label", {"report": "20990101-000000", "bug": ""})[0] == 400


def test_the_page_has_no_data_and_a_strict_policy(inbox):
    base, _ = inbox
    with urllib.request.urlopen(base + "/v1/bugs", timeout=10) as res:
        page = res.read().decode()
        policy = res.headers["Content-Security-Policy"]
    assert "HPC Hub bugs" in page and "script-src 'self'" in policy and "frame-ancestors 'none'" in policy
    js = (INBOX.parent / "board.js").read_text()
    assert "innerHTML" not in js and "insertAdjacentHTML" not in js  # what people sent is only ever text


def test_an_older_inbox_gets_the_label_column(tmp_path, monkeypatch):
    import sqlite3
    state = tmp_path / "state"
    state.mkdir()
    old = sqlite3.connect(state / "reports.db")
    old.execute("CREATE TABLE reports (id TEXT PRIMARY KEY, received INTEGER, who TEXT, kind TEXT, text TEXT, "
                "error TEXT, log TEXT, page TEXT, app TEXT, platform TEXT, os TEXT, contact TEXT, shot INTEGER, "
                "done INTEGER DEFAULT 0)")
    old.execute("INSERT INTO reports (id, received, kind, text) VALUES ('20261101-abcdef', 1, 'user', 'old one')")
    old.commit()
    old.close()
    monkeypatch.setenv("STATE_DIRECTORY", str(state))
    spec = importlib.util.spec_from_file_location("inbox_upgrade", INBOX)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    board = mod.board(mod.db())
    assert [r["id"] for r in board["unlabeled"]] == ["20261101-abcdef"]
