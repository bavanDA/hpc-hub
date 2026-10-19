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
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
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
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
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
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
    assert not s.vpn_used
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_borrows_running_job(env, monkeypatch):
    server, tmp = env
    monkeypatch.setenv("FAKE_JOBS", "77|claude|r05|devel;78|bash|r06|devel")
    cfg = ClusterConfig(id="t", name="Test", host="fake", reuse_running_job=True)
    rec = Recorder()
    s = ClusterSession(cfg, server, rec)
    s.connect(Login("u", "pw"), None)
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
    assert (s.allocation.job_id, s.allocation.node, s.allocation.owned) == ("77", "r05", False)

    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)
    cmds = (tmp / "cmds.log").read_text()
    assert "salloc" not in cmds and "scancel" not in cmds


def test_extra_node(env):
    server, tmp = env
    s, rec = connect(server, "pw")
    got = {}
    done = threading.Event()
    s.extra_node("hpc-hub-claude", lambda a, err: (got.update(a=a, err=err), done.set()))
    assert done.wait(20)
    assert got["a"].job_id == "42" and not got["a"].owned
    assert "--job-name=hpc-hub-claude" in (tmp / "cmds.log").read_text()
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_vpn_only(env, monkeypatch):
    from hpc_hub import session as session_mod
    calls = []
    monkeypatch.setattr(session_mod.Vpn, "is_active", lambda self: "up" in calls and "down" not in calls)
    monkeypatch.setattr(session_mod.Vpn, "ensure_profile", lambda self: None)
    monkeypatch.setattr(session_mod.Vpn, "authenticate", lambda self, *a, **k: {"COOKIE": "c"})
    monkeypatch.setattr(session_mod.Vpn, "up", lambda self, auth: calls.append("up"))
    monkeypatch.setattr(session_mod.Vpn, "down", lambda self: calls.append("down"))
    monkeypatch.setattr(session_mod, "reachable", lambda *a, **k: True)
    server, _ = env
    cfg = ClusterConfig(id="t", name="Test", host="fake")
    cfg.vpn.enabled, cfg.vpn.gateway = True, "vpn.example"
    rec = Recorder()
    s = ClusterSession(cfg, server, rec)
    s.connect(Login("u", "pw"), Login("u", "pw"), vpn_only=True)
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED and s.detail == "VPN only" and s.ssh is None, rec.lines
    assert calls == ["up"] and s.healthy()
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)
    assert calls == ["up", "down"]


def test_adopt_after_restart(env, monkeypatch):
    server, _ = env
    monkeypatch.setenv("FAKE_JOBS", "42|hpc-hub|n0001|")
    first, rec = connect(server, "pw")
    assert first.state == State.CONNECTED
    again = ClusterSession(first.cfg, server, Recorder())
    again.adopt("u")
    assert again.state == State.CONNECTED and again.ssh and not again.vpn_only
    assert (again.allocation.job_id, again.allocation.owned) == ("42", True)
    rec.done.clear()
    first.disconnect()
    assert rec.done.wait(20)


def test_unexpected_error_shows(env, monkeypatch):
    server, _ = env
    rec = Recorder()
    s = ClusterSession(ClusterConfig(id="t", name="Test", host="fake"), server, rec)
    monkeypatch.setattr(s, "_connect", lambda *a: 1 / 0)
    s.connect(Login("u", "pw"), None)
    assert rec.done.wait(10)
    assert s.state == State.ERROR and "Unexpected error" in s.detail


def test_double_click_starts_once(env):
    server, _ = env
    rec = Recorder()
    s = ClusterSession(ClusterConfig(id="t", name="Test", host="fake"), server, rec)
    s.connect(Login("u", "pw"), None)
    first = s._thread
    s.connect(Login("u", "pw"), None)
    assert s._thread is first
    rec.done.wait(20)
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_no_node_then_get_and_release(env):
    server, tmp = env
    rec = Recorder()
    s = ClusterSession(ClusterConfig(id="t", name="Test", host="fake", request_node_on_connect=False), server, rec)
    s.connect(Login("u", "pw"), None)
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED and s.allocation is None
    log = tmp / "cmds.log"
    assert "salloc" not in (log.read_text() if log.exists() else "")

    rec.done.clear()
    s.request_node()
    assert rec.done.wait(20)
    assert s.allocation.job_id == "42"

    rec.done.clear()
    s.release_node()
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED and s.allocation is None
    assert "scancel 42" in (tmp / "cmds.log").read_text()
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_healthy_needs_working_link(env, monkeypatch):
    server, tmp = env
    s, rec = connect(server, "pw")
    assert s.healthy()
    run = s.ssh.run
    s.ssh.run = lambda *a, **k: __import__("subprocess").CompletedProcess([], 255, "", "")
    monkeypatch.setattr("hpc_hub.session.time.sleep", lambda _s: None)
    assert not s.healthy()
    s.ssh.run = run
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def _connect_with_jobs(server, monkeypatch, jobs, **cfg):
    monkeypatch.setenv("FAKE_JOBS", jobs)
    rec = Recorder()
    s = ClusterSession(ClusterConfig(id="t", name="Test", host="fake", **cfg), server, rec)
    s.connect(Login("u", "pw"), None)
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
    return s, rec


def test_reuses_own_node_without_salloc(env, monkeypatch):
    server, tmp = env
    s, rec = _connect_with_jobs(server, monkeypatch, "55|hpc-hub|n0055|general;56|bash|n0099|general")
    assert (s.allocation.job_id, s.allocation.node, s.allocation.owned) == ("55", "n0055", True)
    assert "salloc" not in (tmp / "cmds.log").read_text()
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_reuses_agent_node_but_not_strangers(env, monkeypatch):
    server, tmp = env
    s, rec = _connect_with_jobs(server, monkeypatch, "70|hpc-hub-claude|n0070|general;71|bash|n0071|general")
    assert (s.allocation.job_id, s.allocation.owned) == ("70", False)
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)
    assert "scancel" not in (tmp / "cmds.log").read_text()  # not ours to cancel

    s, rec = _connect_with_jobs(server, monkeypatch, "71|bash|n0071|general;72|hpc-hub-vscode|n0072|general")
    assert s.allocation.job_id == "42"  # a fresh node: your own jobs and VS Code are left alone
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_switches_when_node_ends(env, monkeypatch):
    server, tmp = env
    s, rec = _connect_with_jobs(server, monkeypatch, "55|hpc-hub|n0055|general;70|hpc-hub-codex|n0070|general")
    assert s.allocation.job_id == "55"
    monkeypatch.setenv("FAKE_JOBS", "70|hpc-hub-codex|n0070|general")  # 55 hit its time limit
    s.check_node()
    assert (s.allocation.job_id, s.allocation.owned) == ("70", False)
    assert "Job 55 on n0055 has ended" in rec.lines
    s.check_node()
    assert s.allocation.job_id == "70"
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_reconnect_reuses_live_login(env):
    server, tmp = env
    s, rec = connect(server, "pw")
    s.state = State.ERROR  # e.g. marked lost, but the login still works
    rec.done.clear()
    s.connect(Login("u", "wrong password"), None)  # would fail if it logged in again
    assert rec.done.wait(20)
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
    assert any("reusing that login" in line for line in rec.lines)
    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(20)


def test_route_device(monkeypatch):
    import subprocess
    from hpc_hub import session
    monkeypatch.setattr(session.socket, "gethostbyname", lambda h: "128.235.212.9")
    monkeypatch.setattr(session.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(
        a, 0, "128.235.212.9 dev vpn1 src 10.192.144.79 uid 1000 \n    cache \n", ""))
    assert session.route_device("wulver.njit.edu") == "vpn1"
