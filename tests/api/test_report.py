import io
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from hpc_hub.api import recent
from hpc_hub.api.methods import report
from hpc_hub.api.server import Server, method
from hpc_hub.core import config, credentials
from hpc_hub.core.credentials import Login


@method("test.report_fail")
def _fail():
    raise RuntimeError("could not list /home/jdoe/thesis for jdoe")


@pytest.fixture
def made_up(monkeypatch, tmp_path):
    """A computer whose only person is jdoe, with made-up logins, account and group."""
    clusters = config.default_clusters()[:1]
    clusters[0].profile.account = "abc123"
    clusters[0].vscode.workdir = "/project/mygroup/jdoe/code"
    logins = {credentials.SSH: Login("jdoe", "hunter2!"), credentials.VPN: Login("jane.doe@example.edu", "")}
    monkeypatch.setattr(config, "load", lambda *a: clusters)
    monkeypatch.setattr(credentials, "load", lambda cid, kind: logins.get(kind))
    monkeypatch.setattr(report.getpass, "getuser", lambda: "jdoe")
    monkeypatch.setattr(report.socket, "gethostname", lambda: "jdoe-laptop.local")
    monkeypatch.setattr(report.store, "load", lambda *a: [])
    monkeypatch.setattr(report, "_known", None)
    monkeypatch.setattr(report, "_cluster_logs", lambda cluster: ["Wulver connection log\n12:00:01  ssh jdoe@10.0.0.7"])
    recent.clear()


def test_a_failed_call_keeps_its_traceback_and_the_preview_scrubs_it(made_up):
    out = io.StringIO()
    Server(out=out).serve(iter(['{"jsonrpc":"2.0","id":1,"method":"test.report_fail"}\n']))
    err = json.loads(out.getvalue())["error"]
    assert err["message"].startswith("could not list") and isinstance(err["data"]["ref"], int)
    got = report.preview(error=f"Could not list files: {err['message']}", ref=err["data"]["ref"],
                         lines=["12:00:02  password=hunter2! typed", "paste from jdoe-laptop"], page="files")
    assert "Traceback" in got["error"] and "test.report_fail failed" in got["error"]
    assert "<home>/thesis for <user>" in got["error"]
    everything = json.dumps(got)
    for leaked in ("jdoe", "hunter2", "10.0.0.7", "jane.doe"):
        assert leaked not in everything, leaked
    assert "Recent errors" in got["log"] and "<user>@<ip>" in got["log"] and "<host>" in got["log"]
    assert got["kind"] == "error" and got["page"] == "files" and got["app"] and got["platform"] and got["os"]


def test_known_names_come_from_logins_accounts_and_group_folders(made_up):
    k = report.known()
    assert {"jdoe", "jane.doe@example.edu", "jane.doe"} <= k.users and "hunter2!" in k.secrets
    assert k.accounts == {"abc123"} and k.groups == {"mygroup"} and k.hosts == {"jdoe-laptop"}
    assert report.scrub_text("my account abc123 in mygroup") == "my account <account> in <group>"


def test_a_user_report_has_no_error_and_long_fields_are_cut(made_up):
    got = report.preview(kind="user", error="ignored", lines=["x" * 30000])
    assert got["error"] == "" and len(got["log"]) <= report.LIMITS["log"]
    with pytest.raises(ValueError):
        report.preview(kind="nope")


class StandIn:
    """The report server, on this computer: answers what each test sets, keeps what it was sent."""

    def __init__(self):
        self.answer = (200, {"id": "abc123"})
        self.wait = 0.0
        self.got: list[dict] = []
        stand_in = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                stand_in.got.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                time.sleep(stand_in.wait)
                code, body = stand_in.answer
                data = json.dumps(body).encode()
                try:
                    self.send_response(code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except OSError:  # the app stopped waiting (the timeout test)
                    pass

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}/report"
        threading.Thread(target=self.server.serve_forever, args=(0.05,), daemon=True).start()


@pytest.fixture
def stand_in(made_up, monkeypatch):
    s = StandIn()
    monkeypatch.setattr(report, "URL", s.url)
    yield s
    s.server.shutdown()
    s.server.server_close()


def test_send_posts_what_was_shown(stand_in):
    shown = report.preview(error="Could not list files: jdoe", page="files")
    shown["text"] = report.scrub_text("It broke for jdoe")
    shown["contact"] = "jane.doe@example.edu"  # typed to get an answer: sent as typed
    shot = report.SHOT_PREFIX + "iVBORw0KGgo="
    assert report.send(shown, screenshot=shot) == {"id": "abc123"}
    got = stand_in.got[0]
    assert {k: got[k] for k in ("kind", "error", "log", "page", "text")} == \
        {k: shown[k] for k in ("kind", "error", "log", "page", "text")}
    assert got["contact"] == "jane.doe@example.edu" and got["screenshot"] == shot
    assert got["text"] == "It broke for <user>"


def test_send_scrubs_again_on_the_way_out(stand_in):
    report.send({"kind": "user", "text": "password=hunter2! from 10.1.2.3"})
    assert stand_in.got[0]["text"] == "password=<hidden> from <ip>" and "error" not in stand_in.got[0]


@pytest.mark.parametrize("answer, said", [
    ((429, {"error": "slow down"}), "Too many reports"),
    ((400, {"error": "text is too long"}), "turned the report down: text is too long"),
    ((413, {}), "HTTP 413"),
    ((500, {"error": "boom"}), "has a problem right now"),
    ((200, {"nope": 1}), "could not read"),
])
def test_send_says_plainly_what_went_wrong(stand_in, answer, said):
    stand_in.answer = answer
    with pytest.raises(RuntimeError, match=said):
        report.send({"kind": "user", "text": "hi"})


def test_send_offline_and_too_slow(stand_in, monkeypatch):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        closed = s.getsockname()[1]
    monkeypatch.setattr(report, "URL", f"http://127.0.0.1:{closed}/report")
    with pytest.raises(RuntimeError, match="Could not reach the report server"):
        report.send({"kind": "user", "text": "hi"})
    monkeypatch.setattr(report, "URL", stand_in.url)
    monkeypatch.setattr(report, "TIMEOUT", 0.3)
    stand_in.wait = 1
    with pytest.raises(RuntimeError, match="did not answer"):
        report.send({"kind": "user", "text": "hi"})


def test_screenshot_must_be_a_small_png(stand_in):
    with pytest.raises(ValueError, match="PNG"):
        report.send({"kind": "user"}, screenshot="data:image/jpeg;base64,abc")
    with pytest.raises(ValueError, match="too big"):
        report.send({"kind": "user"}, screenshot=report.SHOT_PREFIX + "A" * 3_400_000)
    assert not stand_in.got
