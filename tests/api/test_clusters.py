import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import clusters
from hpc_hub.compute.limits import Limits
from hpc_hub.connect.state import State
from hpc_hub.core import config, credentials
from hpc_hub.core.credentials import Login


class FakeSession:
    """Stands in for ClusterSession: records what was asked, touches nothing."""

    def __init__(self, cfg, state=State.DISCONNECTED):
        self.cfg, self.state, self.limits, self.calls = cfg, state, None, []

    @property
    def connected(self):
        return self.state == State.CONNECTED

    def connect(self, ssh, vpn, vpn_only=False):
        self.calls.append(("connect", ssh, vpn, vpn_only))

    def disconnect(self, on_done=None):
        self.calls.append(("disconnect",))
        if on_done:
            on_done()

    def cancel(self):
        self.calls.append(("cancel",))

    def request_node(self, profile=None):
        self.calls.append(("request_node", profile))

    def release_node(self):
        self.calls.append(("release_node",))


@pytest.fixture
def hub(monkeypatch):
    h = Hub.__new__(Hub)  # no askpass socket, no config from disk
    h.clusters = config.default_clusters()
    h.sessions = {c.id: FakeSession(c) for c in h.clusters}
    h.saved = 0

    def save():
        h.saved += 1
    h.save_clusters = save
    monkeypatch.setattr(hub_mod, "_hub", h)
    return h


@pytest.fixture
def keyring(monkeypatch):
    store: dict[tuple[str, str], Login] = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: store.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: store.__setitem__((c, k), login))
    monkeypatch.setattr(credentials, "clear", lambda c, k: store.pop((c, k), None))
    return store


def test_connect_needs_a_saved_login(hub, keyring):
    with pytest.raises(ValueError, match="settings"):
        clusters.connect("sdsc")
    assert hub.sessions["sdsc"].calls == []


def test_connect_uses_the_saved_logins(hub, keyring):
    keyring["wulver", "ssh"] = Login("jdoe", "pw")
    assert clusters.connect("wulver", vpn_only=True) is None
    _, ssh, vpn, only = hub.sessions["wulver"].calls[0]
    assert ssh == Login("jdoe", "pw") and vpn == ssh and only

    keyring["yale", "ssh"] = Login("jdoe", "pw")  # Yale's VPN wants its own login
    with pytest.raises(ValueError, match="VPN login"):
        clusters.connect("yale")
    keyring["yale", "vpn"] = Login("jane.doe@example.edu", "")
    hub.sessions["wulver"].state = State.DISCONNECTED
    clusters.connect("yale")
    assert hub.sessions["yale"].calls[0][2] == Login("jane.doe@example.edu", "pw")  # empty: the SSH password


def test_full_tunnel_asks_before_switching(hub, keyring):
    keyring["yale", "ssh"] = keyring["yale", "vpn"] = keyring["wulver", "ssh"] = Login("jdoe", "pw")
    hub.clusters[0].vpn.split_tunnel = False
    hub.sessions["wulver"].state = State.CONNECTED
    assert clusters.connect("yale") == {"switch": {"id": "wulver", "name": "Wulver (NJIT)"}}
    assert hub.sessions["yale"].calls == []
    clusters.connect("yale", switch=True)
    assert hub.sessions["wulver"].calls == [("disconnect",)] and hub.sessions["yale"].calls[0][0] == "connect"


def test_disconnect_cancel_and_nodes(hub):
    s = hub.sessions["sdsc"]
    clusters.disconnect("sdsc")
    clusters.cancel("sdsc")
    with pytest.raises(RuntimeError, match="Connect to SDSC Expanse first"):
        clusters.request_node("sdsc")
    s.state = State.CONNECTED
    clusters.request_node("sdsc")
    clusters.request_node("sdsc", {"cpus": 8, "time": "02:00:00"}, remember=True)
    clusters.release_node("sdsc")
    assert [c[0] for c in s.calls] == ["disconnect", "cancel", "request_node", "request_node", "release_node"]
    assert s.calls[2][1] is None and s.calls[3][1].cpus == 8
    assert s.cfg.profile.cpus == 8 and s.cfg.profile.mem_gb == 16 and hub.saved == 1
    with pytest.raises(ValueError, match="No cluster"):
        clusters.cancel("nope")


def test_update_saves_only_safe_settings(hub):
    out = clusters.update("wulver", {"request_node_on_connect": False, "ask_node": True,
                                     "profile": {"cpus": 6, "partition": "debug"},
                                     "vpn": {"same_login_as_ssh": False}})
    cfg = hub.sessions["wulver"].cfg
    assert not cfg.request_node_on_connect and cfg.ask_node and cfg.profile.cpus == 6
    assert cfg.profile.partition == "debug"
    assert not cfg.vpn.same_login_as_ssh and out["profile"]["cpus"] == 6 and hub.saved == 1
    for bad in ({"host": "evil"}, {"profile": {"extra_args": "--x"}}, {"profile": {"cpus": 0}},
                {"profile": {"cpus": "4"}}, {"profile": {"partition": "a;b"}}, {"profile": {"time": "soon"}},
                {"vpn": {"gateway": "x"}}):
        with pytest.raises(ValueError):
            clusters.update("wulver", bad)
    assert cfg.profile.cpus == 6 and hub.saved == 1  # a refused change saves nothing


def test_logins_go_in_but_passwords_never_come_out(hub, keyring):
    assert clusters.login("sdsc") == {"ssh": {"username": "", "password": False},
                                      "vpn": {"username": "", "password": False}, "remember": True}
    clusters.set_login("sdsc", "ssh", " jdoe ", "secret")
    assert keyring["sdsc", "ssh"] == Login("jdoe", "secret")
    clusters.set_login("sdsc", "ssh", "jdoe2", "")  # empty keeps the saved password
    assert keyring["sdsc", "ssh"] == Login("jdoe2", "secret")
    assert clusters.login("sdsc")["ssh"] == {"username": "jdoe2", "password": True}
    with pytest.raises(ValueError):
        clusters.set_login("sdsc", "ftp", "jdoe", "x")
    with pytest.raises(ValueError):
        clusters.set_login("sdsc", "vpn", " ", "x")
    clusters.forget_logins("sdsc")
    assert not keyring


def test_partitions_and_longest_time(hub):
    assert clusters.partitions("wulver")["known"] is False
    hub.sessions["wulver"].limits = Limits(partitions={"general": 4320, "debug": 480}, default_partition="general",
                                           qos={"low": 1440}, allowed_qos=["low"], default_qos="low")
    got = clusters.partitions("wulver", partition="debug")
    assert got["known"] and got["partitions"] == ["general", "debug"] and got["qos"] == ["low"]
    assert (got["longest"], got["why"]) == (480, "partition debug")
    assert clusters.partitions("wulver")["longest"] == 1440


def test_log_tail(hub, monkeypatch, tmp_path):
    monkeypatch.setattr(clusters, "log_dir", lambda: tmp_path)
    assert clusters.log("wulver") == []
    (tmp_path / "wulver.log").write_text("2026-01-02 10:00:00 VPN up\n2026-01-02 10:00:05 Signed in as jdoe\n")
    assert clusters.log("wulver", lines=1) == ["10:00:05  Signed in as jdoe"]


def test_password_not_remembered_is_asked_once_and_kept_in_memory(monkeypatch):
    from hpc_hub.api.methods import clusters as m
    from hpc_hub.core import config, credentials
    cfg = config.default_clusters()[2]  # no VPN
    saved = {}
    monkeypatch.setattr(credentials, "save", lambda c, k, login: saved.__setitem__((c, k), login))
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    monkeypatch.setattr(credentials, "clear", lambda c, k: saved.pop((c, k), None))
    asked = []
    fake = type("H", (), {"save_clusters": lambda self: None,
                          "question": lambda self, kind, data: asked.append(data["prompt"]) or "secret",
                          "session": lambda self, c: type("S", (), {"cfg": cfg})()})()
    monkeypatch.setattr(m, "hub", lambda: fake)
    m.set_login(cfg.id, "ssh", "jdoe", "typed-now", remember=False)
    assert saved[(cfg.id, "ssh")] == credentials.Login("jdoe", "") and not cfg.remember_password  # no password kept
    assert m._logins(cfg)[0].password == "typed-now" and asked == []  # typed in settings: no need to ask
    m.forget_logins(cfg.id)
    m.set_login(cfg.id, "ssh", "jdoe", None, remember=False)
    assert m._logins(cfg)[0].password == "secret" and m._logins(cfg)[0].password == "secret"
    assert len(asked) == 1  # once per run


def test_forget_can_keep_the_username(monkeypatch):
    from hpc_hub.api.methods import clusters as m
    from hpc_hub.core import config, credentials
    cfg = config.default_clusters()[0]
    saved = {(cfg.id, "ssh"): credentials.Login("jdoe", "pw"), (cfg.id, "vpn"): credentials.Login("jdoe", "vpw")}
    monkeypatch.setattr(credentials, "save", lambda c, k, login: saved.__setitem__((c, k), login))
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    monkeypatch.setattr(credentials, "clear", lambda c, k: saved.pop((c, k), None))
    monkeypatch.setattr(m, "hub", lambda: type("H", (), {"session": lambda self, c: type("S", (), {"cfg": cfg})()})())
    m.forget_logins(cfg.id, keep_username=True)
    assert saved == {(cfg.id, "ssh"): credentials.Login("jdoe", ""), (cfg.id, "vpn"): credentials.Login("jdoe", "")}
    m.forget_logins(cfg.id)
    assert saved == {}
