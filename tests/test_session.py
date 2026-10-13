import threading
from pathlib import Path

import pytest

from hpc_hub.askpass_server import AskpassServer
from hpc_hub.config import ClusterConfig
from hpc_hub.credentials import Login
from hpc_hub.session import ClusterSession, State

FAKE_BIN = Path(__file__).parent / "fake_bin"


class Recorder:
    def __init__(self):
        self.states, self.lines = [], []
        self.done = threading.Event()

    def state_changed(self, s):
        self.states.append(s.state)
        if s.state in (State.CONNECTED, State.ERROR, State.DISCONNECTED):
            self.done.set()

    def log(self, s, line):
        self.lines.append(line)

    def ask(self, s, prompt):
        return None


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setenv("PATH", f"{FAKE_BIN}:" + __import__("os").environ["PATH"])
    monkeypatch.setenv("FAKE_SSH_LOG", str(tmp_path / "cmds.log"))
    server = AskpassServer()
    server.start()
    yield server, tmp_path
    server.stop()


def connect(server, password):
    rec = Recorder()
    s = ClusterSession(ClusterConfig(id="t", name="Test", host="fake"), server, rec)
    s.connect(Login("u", password), None)
    assert rec.done.wait(20)
    return s, rec


def test_full_flow(env):
    server, tmp = env
    s, rec = connect(server, "pw")
    assert s.state == State.CONNECTED, rec.lines
    assert State.DUO in rec.states and State.ALLOCATING in rec.states
    assert s.allocation.job_id == "42" and s.allocation.node == "n0001"

    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)
    assert s.state == State.DISCONNECTED
    assert "scancel 42" in (tmp / "cmds.log").read_text()


def test_wrong_password(env):
    server, _ = env
    s, rec = connect(server, "nope")
    assert s.state == State.ERROR
    assert "Permission denied" in s.detail


def test_skips_vpn_when_reachable(env, monkeypatch):
    import socket
    from hpc_hub import session as session_mod

    def no_vpn(*_a, **_k):
        raise AssertionError("VPN should be skipped")

    monkeypatch.setattr(session_mod.Vpn, "is_active", lambda self: False)
    monkeypatch.setattr(session_mod.Vpn, "ensure_profile", no_vpn)
    server, _ = env
    with socket.create_server(("127.0.0.1", 0)) as listener:
        cfg = ClusterConfig(id="t", name="Test", host="127.0.0.1", port=listener.getsockname()[1])
        cfg.vpn.enabled = True
        rec = Recorder()
        s = ClusterSession(cfg, server, rec)
        s.connect(Login("u", "pw"), Login("u", "pw"))
        assert rec.done.wait(20)
    assert s.state == State.CONNECTED, rec.lines
    assert not s.vpn_used
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)
