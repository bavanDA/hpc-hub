import pytest

from hpc_hub.api.hub import Hub
from hpc_hub.connect.state import State
from hpc_hub.core import config


def test_chosen_clusters_keep_the_others_settings(tmp_path):
    path = tmp_path / "clusters.toml"
    app = config.AppSettings()
    assert config.first_run(app, path)  # nothing saved: ask
    every = config.load(path)
    every[1].host = "login.example.edu"  # a change to Yale
    config.save(every, path)
    app.clusters = "wulver,sdsc"
    mine = config.chosen(config.load(path), app)
    assert [c.id for c in mine] == ["wulver", "sdsc"] and not config.first_run(app, path)
    mine[0].port = 2222
    config.save_chosen(mine, path)
    back = {c.id: c for c in config.load(path)}
    assert back["wulver"].port == 2222 and back["yale"].host == "login.example.edu"  # Yale's setting survived
    assert config.chosen(config.load(path), config.AppSettings()) == config.load(path)  # empty = all


def test_use_clusters_adds_and_drops_sessions(monkeypatch):
    saved = []
    monkeypatch.setattr(config, "save_chosen", lambda c: saved.append([x.id for x in c]))
    h = Hub(lambda *a: None)
    h.clusters = config.default_clusters()
    h.askpass = None
    from hpc_hub.connect.session import ClusterSession
    h.sessions = {c.id: ClusterSession(c, None, h) for c in h.clusters}
    h.use_clusters(["sdsc"])
    assert list(h.sessions) == ["sdsc"] and [c.id for c in h.clusters] == ["sdsc"] and saved[-1] == ["sdsc"]
    h.use_clusters(["sdsc", "wulver"])
    assert set(h.sessions) == {"sdsc", "wulver"}
    h.sessions["wulver"].state = State.CONNECTED
    with pytest.raises(RuntimeError, match="Disconnect"):
        h.use_clusters(["sdsc"])
