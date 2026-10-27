import pytest

from hpc_hub.api.methods import monitor as api


class FakeHub:
    """One connected cluster; events are kept."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.ssh = object()

    def connected(self, cluster):
        if cluster != "demo":
            raise RuntimeError("Connect to Other first")
        return type("Session", (), {"ssh": self.ssh})()

    def emit(self, name, data):
        self.events.append((name, data))


@pytest.fixture
def fake(monkeypatch):
    h = FakeHub()
    watched: dict[str, list] = {"watch": [], "stopped": []}

    def watch(ssh, node, fn):
        watched["watch"].append((ssh, node, fn))
        return lambda: watched["stopped"].append(node)
    monkeypatch.setattr(api, "hub", lambda: h)
    monkeypatch.setattr(api.monitor, "watch", watch)
    monkeypatch.setattr(api, "_watches", {})
    return h, watched


def test_watch_pushes_events_with_its_id(fake):
    h, watched = fake
    a = api.watch("demo")
    b = api.watch("demo", node="node-a1")
    assert a != b
    (ssh, node, fn), (_, node_b, fn_b) = watched["watch"]
    assert ssh is h.ssh and node == "" and node_b == "node-a1"
    fn({"host": "login01", "cpu": 12.5})
    fn_b({"host": "node-a1", "cpu": None})
    assert h.events == [("monitor", {"id": a, "host": "login01", "cpu": 12.5}),
                        ("monitor", {"id": b, "host": "node-a1", "cpu": None})]


def test_unwatch_stops_once(fake):
    _, watched = fake
    wid = api.watch("demo", node="node-a1")
    api.unwatch(wid)
    api.unwatch(wid)
    api.unwatch(9999)
    assert watched["stopped"] == ["node-a1"]


def test_not_connected_says_so(fake):
    with pytest.raises(RuntimeError, match="Connect to Other first"):
        api.watch("other")
    assert not fake[1]["watch"]
