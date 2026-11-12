"""The whole connect flow on the asyncssh login (Windows): password and Duo answered by the session, a compute
node from salloc (through the bridge), released on disconnect. The cluster is tests/fake_sshd.py, its Slurm
three scripts."""

import os
import threading

import pytest

pytest.importorskip("asyncssh")

from hpc_hub.connect.askpass_server import AskpassServer  # noqa: E402
from hpc_hub.connect.session import ClusterSession, State  # noqa: E402
from hpc_hub.core import ssh_async  # noqa: E402
from hpc_hub.core.config import ClusterConfig  # noqa: E402
from hpc_hub.core.credentials import Login  # noqa: E402

SLURM = {
    "salloc": 'echo "$*" >> "$LOG"; echo "salloc: Pending job allocation 42"; echo "salloc: Granted job allocation 42"',
    "squeue": 'case "$*" in *%i*) ;; *%N*) echo n0001 ;; *%T*) echo RUNNING ;; esac',
    "scancel": 'echo "scancel $*" >> "$LOG"',
}


class Recorder:
    def __init__(self):
        self.states, self.lines, self.asked = [], [], []
        self.done = threading.Event()

    def state_changed(self, s):
        self.states.append(s.state)
        if s.state in (State.CONNECTED, State.ERROR, State.DISCONNECTED):
            self.done.set()

    def log(self, s, line):
        self.lines.append(line)

    def ask(self, s, prompt):
        self.asked.append(prompt)
        return None


@pytest.fixture
def cluster(sshd, tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in SLURM.items():
        (bin_dir / name).write_text(f"#!/bin/sh\n{body}\n")
        (bin_dir / name).chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setenv("LOG", str(tmp_path / "slurm.log"))
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    askpass = AskpassServer()
    askpass.start()
    yield ClusterConfig(id="t", name="Test", host="127.0.0.1", port=sshd.port), askpass, tmp_path
    askpass.stop()


def test_duo_login_node_and_disconnect(cluster, sshd):
    cfg, askpass, tmp = cluster
    rec = Recorder()
    s = ClusterSession(cfg, askpass, rec)
    s.connect(Login("u", "pw"), None)
    assert rec.done.wait(30)
    assert s.state == State.CONNECTED, "\n".join(rec.lines)
    assert isinstance(s.ssh, ssh_async.AsyncSshMaster)
    assert State.DUO in rec.states and sshd.duo == [["1"]] and not rec.asked
    assert (s.allocation.job_id, s.allocation.node) == ("42", "n0001")
    assert s.healthy()

    rec.done.clear()
    s.disconnect()
    assert rec.done.wait(30)
    assert s.state == State.DISCONNECTED and s.ssh is None
    assert "scancel 42" in (tmp / "slurm.log").read_text()


def test_wrong_password_stops_asking(cluster):
    cfg, askpass, _ = cluster
    rec = Recorder()
    s = ClusterSession(cfg, askpass, rec)
    s.connect(Login("u", "nope"), None)
    assert rec.done.wait(30)
    assert s.state == State.ERROR and "didn't accept the password for u" in s.detail
    assert s.wrong_password  # the app asks for the password again, in a window that says so
    assert any("password asked again" in line for line in rec.lines)  # the session's lockout guard
