import threading
import time

from hpc_hub.api import health
from hpc_hub.api.health import Health
from hpc_hub.connect.state import State
from hpc_hub.core import config


class FakeSession:
    def __init__(self, cfg, state=State.CONNECTED, ok=True, slow=0.0):
        self.cfg, self.state, self.ok, self.slow, self.calls = cfg, state, ok, slow, []

    def healthy(self):
        self.calls.append("healthy")
        time.sleep(self.slow)
        if self.ok is None:
            raise OSError("ssh broke")
        return self.ok

    def mark_lost(self):
        self.calls.append("lost")
        self.state = State.ERROR

    def check_node(self):
        self.calls.append("node")


def sessions(**kw):
    c = config.default_clusters()
    return [FakeSession(c[0], **kw), FakeSession(c[1], state=State.DISCONNECTED), FakeSession(c[2], ok=False)]


def settle(h):
    end = time.monotonic() + 5
    while h._busy and time.monotonic() < end:
        time.sleep(0.01)


def test_check_all_marks_lost_and_checks_nodes():
    a, b, c = sessions()
    h = Health(lambda: [a, b, c])
    h.check_all()
    settle(h)
    assert a.calls == ["healthy", "node"] and b.calls == [] and c.calls == ["healthy", "lost"]
    assert c.state == State.ERROR


def test_a_slow_check_is_not_started_twice_and_errors_are_quiet():
    a, _, _ = sessions(slow=0.2)
    h = Health(lambda: [a])
    h.check_all()
    h.check_all()
    settle(h)
    assert a.calls == ["healthy", "node"]
    a.ok = None  # healthy() raising: nothing marked, the next check tries again
    h.check_all()
    settle(h)
    assert a.calls[-1] == "healthy" and a.state == State.CONNECTED


def run(h):
    t = threading.Thread(target=h.run, daemon=True)
    t.start()
    return t


def test_runs_every_interval_and_after_waking():
    a, _, _ = sessions()
    h = Health(lambda: [a], every=0.1, tick=0.02, after_wake=0.05)
    t = run(h)
    time.sleep(0.35)
    regular = a.calls.count("healthy")
    assert 2 <= regular <= 4
    h.every = 100
    a.calls.clear()
    h.resumed()
    time.sleep(0.2)
    assert a.calls == ["healthy", "node"]
    h.stop.set()
    t.join(2)
    assert not t.is_alive()


def test_wall_clock_jump_counts_as_waking(monkeypatch):
    a, _, _ = sessions()
    h = Health(lambda: [a], every=100, tick=0.02, after_wake=0.01)
    jump = [0.0]
    real = time.time
    monkeypatch.setattr(health.time, "time", lambda: real() + jump[0])
    t = run(h)
    time.sleep(0.1)
    assert a.calls == []
    jump[0] = 3600  # an hour asleep: the monotonic clock did not move
    time.sleep(0.15)
    assert a.calls == ["healthy", "node"]
    h.jumps = False  # logind tells us instead: jumps alone do nothing
    a.calls.clear()
    jump[0] = 7200
    time.sleep(0.15)
    assert a.calls == []
    h.stop.set()
    t.join(2)
