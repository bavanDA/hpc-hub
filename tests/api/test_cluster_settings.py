import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import cluster_settings as cs
from hpc_hub.core import browser, config


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def hub(monkeypatch):
    h = Hub.__new__(Hub)  # no askpass socket, no config from disk
    h.clusters = config.default_clusters()
    h.sessions = {c.id: Session(c) for c in h.clusters}
    h.saved = 0

    def save():
        h.saved += 1
    h.save_clusters = save
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(browser, "chrome", lambda: "/usr/bin/google-chrome")
    monkeypatch.setattr(browser, "profiles", lambda: [browser.Profile("Profile 2", "Uni")])
    return h


def test_get_has_the_settings_profiles_and_agent_options(hub):
    got = cs.get("wulver")
    assert got["cluster"]["vpn"]["gateway"] == "vpn.njit.edu" and got["browsers"] == ["Uni"]
    claude = next(a for a in got["agents"] if a["id"] == "claude")
    assert ["opus", "Opus"] in next(o for o in claude["options"] if o["key"] == "model")["choices"]
    assert "anyconnect" in got["protocols"]


def test_save_changes_everything_the_dialog_edits(hub):
    out = cs.save("wulver", {
        "host": " jdoe@wulver.example.edu ", "port": 2222, "second_factor": "code", "duo_answer": "",
        "request_node_on_connect": False, "reuse_running_job": True, "queues": " general:low , debug:debug ",
        "queue_wait": 90,
        "vpn": {"gateway": "https://vpn.example.edu/group", "protocol": "gp", "useragent": "AnyConnect Linux_64 4.10",
                "authgroup": "Default Group", "same_login_as_ssh": False, "split_tunnel": True,
                "domains": " example.edu  ", "routes": "10.0.0.0/8   10.1.0.0/16", "browser": "Uni"},
        "profile": {"cpus": 8, "mem_gb": 32, "time": "1-00:00:00", "partition": "gpu", "gpus": 1,
                    "extra_args": "--constraint=a100 --exclusive"},
        "vscode": {"setup": "module load VSCode", "command": "code tunnel", "workdir": "", "open_links": False,
                   "open_in": "browser", "compute": {"cpus": 4, "extra_args": ""}},
        "claude": {"model": "opus", "effort": "high", "new_node": True, "remote": True, "workdir": "~/proj"},
        "codex": {"sandbox": "read-only"},
    })
    c = hub.sessions["wulver"].cfg
    assert (c.host, c.port, c.second_factor, c.duo_answer) == ("wulver.example.edu", 2222, "code", "push")
    assert not c.request_node_on_connect and c.reuse_running_job and c.queues == "general:low,debug:debug"
    assert c.queue_wait == 90 and c.vpn.protocol == "gp" and c.vpn.browser == "Uni"
    assert c.vpn.domains == "example.edu" and c.vpn.routes == "10.0.0.0/8 10.1.0.0/16"
    assert c.profile.cpus == 8 and c.profile.extra_args == "--constraint=a100 --exclusive"
    assert c.vscode.workdir == "~" and c.vscode.open_in == "browser" and c.vscode.compute.cpus == 4
    assert (c.claude.model, c.claude.effort, c.claude.workdir, c.claude.remote) == ("opus", "high", "~/proj", True)
    assert c.codex.sandbox == "read-only" and out["port"] == 2222 and hub.saved == 1
    assert hub.clusters[0] is c  # the same object the session uses


@pytest.mark.parametrize("bad", [
    {"extra_args": "x"}, {"id": "other"}, {"name": "Evil"}, {"portal": "https://evil.example"},
    {"code_setup": "https://evil.example"}, {"globus": {}}, {"latex": {}},
    {"host": "evil host"}, {"host": "a;b"}, {"port": 0}, {"port": "22"}, {"second_factor": "sms"},
    {"duo_answer": "push; rm"}, {"request_node_on_connect": "yes"}, {"queues": "general"},
    {"queues": "gen;eral:low"}, {"queue_wait": -1},
    {"vpn": {"gateway": "vpn.example.edu --script=/tmp/x"}}, {"vpn": {"protocol": "ssh"}},
    {"vpn": {"useragent": "a\nb"}}, {"vpn": {"routes": "not-a-net"}}, {"vpn": {"domains": "a;b"}},
    {"vpn": {"browser": "Nobody"}}, {"vpn": {"enabled": True, "gateway": ""}}, {"vpn": {"servercert": "x"}},
    {"profile": {"cpus": 0}}, {"profile": {"cpus": True}}, {"profile": {"partition": "a;b"}},
    {"profile": {"time": "soon"}}, {"profile": {"extra_args": "'unbalanced"}},
    {"profile": {"extra_args": "--begin=now hostname"}},  # a word salloc would run as a command
    {"profile": {"extra_args": "--comment='a\nb'"}}, {"profile": {"nodes": 2}},
    {"vscode": {"command": ""}}, {"vscode": {"setup": "a\nrm -rf ~"}}, {"vscode": {"open_in": "emacs"}},
    {"vscode": {"compute": {"extra_args": "sleep"}}}, {"vscode": {"jobname": "x"}},
    {"claude": {"command": "rm -rf ~"}}, {"claude": {"model": "gpt"}}, {"cursor": {"remote": 1}},
])
def test_save_refuses_and_keeps_everything(hub, bad):
    before = config.dumps(hub.clusters)
    with pytest.raises(ValueError):
        cs.save("wulver", {"port": 2200, **bad})  # the good change in the same call is not saved either
    assert config.dumps(hub.clusters) == before and hub.saved == 0


def test_browser_that_is_gone_can_stay(hub):
    c = hub.sessions["yale"].cfg
    c.vpn.browser = "Old"  # saved before, not in Chrome any more: keeping it is fine
    cs.save("yale", {"vpn": {"browser": "Old"}})
    cs.save("yale", {"vpn": {"browser": ""}})
    assert c.vpn.browser == "" and hub.saved == 2


def test_chrome_window_is_a_choice_where_chrome_is(hub, monkeypatch):
    from hpc_hub.connect import chrome_window
    assert cs.get("yale")["chrome_window"] == {"value": chrome_window.CHOICE, "offered": True}
    cs.save("yale", {"vpn": {"browser": chrome_window.CHOICE}})
    assert hub.sessions["yale"].cfg.vpn.browser == chrome_window.CHOICE
    monkeypatch.setattr(browser, "chrome", lambda: "")
    assert cs.get("wulver")["chrome_window"]["offered"] is False
    with pytest.raises(ValueError):
        cs.save("wulver", {"vpn": {"browser": chrome_window.CHOICE}})
