"""Terminals the backend runs itself (Windows): a PTY channel on the asyncssh login, streamed as events."""

import base64
import threading
import time

import pytest

pytest.importorskip("asyncssh")

from hpc_hub.api.methods import terminals  # noqa: E402
from hpc_hub.core import ssh_async  # noqa: E402
from hpc_hub.core.config import ClusterConfig  # noqa: E402
from tests import fake_sshd  # noqa: E402


class FakeHub:
    def __init__(self, ssh):
        self.s = type("S", (), {"ssh": ssh, "allocation": None})()
        self.events: list[tuple[str, dict]] = []
        self.ended = threading.Event()

    def connected(self, cluster):
        if cluster != "t":
            raise RuntimeError(f"Connect to {cluster} first")
        return self.s

    def emit(self, name, data):
        self.events.append((name, data))
        if name == "term-exit":
            self.ended.set()

    def output(self, cid) -> bytes:
        return b"".join(base64.b64decode(d["data"]) for n, d in list(self.events) if n == "term-data"
                        and d["id"] == cid)


@pytest.fixture
def hub(sshd, monkeypatch):
    cfg = ClusterConfig(id="t", name="Test", host="127.0.0.1", port=sshd.port)
    master = ssh_async.AsyncSshMaster(cfg, "u", {}, print,
                                      lambda p: fake_sshd.PASSWORD if "Password" in p else "1")
    master.start(timeout=30)
    h = FakeHub(master)
    monkeypatch.setattr(terminals, "hub", lambda: h)
    yield h
    master.stop()


def wait_for(h, cid, text: bytes):
    deadline = time.monotonic() + 10
    while text not in h.output(cid) and time.monotonic() < deadline:
        time.sleep(0.02)
    assert text in h.output(cid), h.output(cid)


def test_command_says_channel_and_it_runs(hub):
    argv = terminals.command("t", session="build")["argv"]
    assert argv[:2] == [ssh_async.CHANNEL, "t"]
    cid = terminals.open_channel(argv, 90, 20)
    wait_for(hub, cid, b"pty xterm-256color 90x20 ")
    terminals.resize(cid, 100, 30)
    wait_for(hub, cid, b"size 100x30")
    terminals.write(cid, "ls\n")
    wait_for(hub, cid, b"echo ls")
    terminals.close(cid)
    assert hub.ended.wait(10)
    assert hub.events[-1][0] == "term-exit" and hub.events[-1][1]["id"] == cid
    terminals.write(cid, "late\n")  # after the end: ignored


def test_only_channel_argv(hub):
    with pytest.raises(ValueError):
        terminals.open_channel(["ssh", "-tt", "host"])
    with pytest.raises(RuntimeError, match="Connect to"):
        terminals.open_channel([ssh_async.CHANNEL, "other", ""])
