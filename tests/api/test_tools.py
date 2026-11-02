import json
import subprocess

import pytest

from hpc_hub.api.methods import tools
from hpc_hub.compute.slurm import Allocation
from hpc_hub.core.config import ClusterConfig


class FakeSsh:
    """Answers commands by a piece of their text, and records what would run on the cluster."""

    def __init__(self, answers=None):
        self.answers, self.ran = dict(answers or {}), []

    def argv(self, command=None, tty=False):
        return ["ssh", *(["-tt"] if tty else []), "jdoe@cluster", *([command] if command else [])]

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        out = next((v for k, v in self.answers.items() if k in command), "")
        return subprocess.CompletedProcess(command, 0, out, "")

    def forward(self, host, port):
        self.forwarded = (host, port)
        return 50123


class FakeSession:
    def __init__(self, ssh, allocation=None):
        self.ssh, self.allocation, self.connected = ssh, allocation, True
        self.cfg = ClusterConfig(id="wulver", name="Wulver")
        self.asked, self.logged = [], []

    def ensure_node(self, on_done, profile=None):
        self.asked.append(("main", profile))
        self.allocation = self.allocation or Allocation("555", "n0100")
        on_done(self.allocation)

    def extra_node(self, job_name, on_done, profile=None):
        self.asked.append((job_name, profile))
        on_done(Allocation("777", "n0200", owned=False), "")

    def fit(self, profile):
        return profile

    def _log(self, line):
        self.logged.append(line)


class FakeHub:
    def __init__(self, session):
        self.s, self.events, self.saved = session, [], 0

    def session(self, cluster):
        if cluster != "wulver":
            raise ValueError(f"No cluster {cluster}")
        return self.s

    def connected(self, cluster):
        return self.session(cluster)

    def save_clusters(self):
        self.saved += 1

    def emit(self, name, data):
        self.events.append((name, data))


@pytest.fixture
def env(monkeypatch):
    ssh = FakeSsh({"type -t": "file\n", 'printf %s "$HOME"': "/home/jdoe"})
    s = FakeSession(ssh, Allocation("123", "n0042"))
    h = FakeHub(s)
    monkeypatch.setattr(tools, "hub", lambda: h)
    return h


def test_setup_gives_node_and_saved_choices(env):
    env.s.cfg.claude.model = "opus"
    got = tools.setup("wulver")
    assert got["node"] == "n0042" and got["job"] == "123" and got["name"] == "Wulver"
    assert got["vscode"]["open_in"] == "desktop" and got["vscode"]["profile"]["cpus"] == 2
    claude = next(a for a in got["agents"] if a["id"] == "claude")
    assert claude["settings"]["model"] == "opus" and claude["remote_label"] == "Remote control"
    assert ["opus", "Opus"] in next(o for o in claude["options"] if o["key"] == "model")["choices"]
    assert claude["profile"] == got["profile"]  # no own choice yet: the cluster's
    assert [a["id"] for a in got["agents"]] == ["claude", "codex", "agy", "cursor"]
    with pytest.raises(ValueError):
        tools.setup("nowhere")


def test_chats_of_a_folder_follow_links(env):
    found = [{"id": "a1", "cwd": "/mmfs1/project/thesis", "title": "Fix plots", "mtime": 5},
             {"id": "b2", "cwd": "/home/jdoe/other", "first": "hello", "mtime": 4},
             {"id": "c3", "cwd": "/home/jdoe/thesis/src", "first": "sub", "mtime": 3}]
    env.s.ssh.answers.update({"python3 -c": json.dumps(found), "readlink -f": "/mmfs1/project/thesis\n"})
    got = tools.chats("wulver", "claude", "~/thesis")
    assert [c["id"] for c in got["chats"]] == ["a1", "c3"] and got["home"] == "/home/jdoe"
    assert got["chats"][0]["name"] == "Fix plots"
    assert len(tools.chats("wulver", "claude")["chats"]) == 3
    with pytest.raises(ValueError):
        tools.chats("wulver", "rm")


def test_installed_agents(env):
    env.s.ssh.answers = {"for c in": "claude\ncursor-agent\n"}
    assert tools.installed("wulver") == ["claude", "cursor"]


def test_agent_on_the_same_node_saves_choices(env):
    got = tools.agent_start("wulver", "claude", "~/thesis", task="Fix the plots", options={"model": "sonnet"},
                            remote_control=True)
    c = env.s.cfg.claude
    assert c.model == "sonnet" and c.remote and c.workdir == "~/thesis" and env.saved == 1
    assert got["node"] == "n0042" and got["name"].startswith("hpchub-claude-123-") and got["title"] == "Claude · thesis"
    line = got["argv"][-1]
    assert got["argv"][:2] == ["ssh", "-tt"] and "n0042" in line and "--model sonnet" in line
    assert "remoteControlAtStartup" in " ".join(env.s.ssh.ran)  # set in settings.json before it starts
    assert env.s.asked == [("main", None)]
    assert any(e[0] == "tools-progress" for e in env.events)


def test_agent_resumes_a_chat_on_a_new_node(env):
    profile = {"cpus": 8, "mem_gb": 32, "time": "02:00:00", "partition": "gpu", "gpus": 1}
    got = tools.agent_start("wulver", "codex", "/home/jdoe/x", chat_id="019a-abc", label="Old chat", new_node=True,
                            profile=profile)
    assert got["node"] == "n0200" and got["name"] == "hpchub-codex-777-019a-abc"
    assert got["title"] == "ChatGPT · Old chat"
    assert "resume --no-daemon 019a-abc" in got["argv"][-1]
    job, asked = env.s.asked[0]
    assert job == "hpc-hub-codex" and asked.cpus == 8 and asked.gpus == 1
    assert env.s.cfg.codex.compute.cpus == 8 and env.s.cfg.codex.workdir == "~"  # a resumed chat keeps the folder


def test_agent_checks_what_you_send(env):
    with pytest.raises(ValueError):
        tools.agent_start("wulver", "claude", chat_id="x; rm -rf ~")
    with pytest.raises(ValueError):
        tools.agent_start("wulver", "claude", options={"model": "--dangerous"})
    with pytest.raises(ValueError):
        tools.agent_start("wulver", "claude", profile={"cpus": 0})
    env.s.ssh.answers["type -t"] = ""
    with pytest.raises(RuntimeError, match="not found"):
        tools.agent_start("wulver", "claude")


def test_agent_without_a_node_says_so(env, monkeypatch):
    env.s.allocation = None
    env.s.ensure_node = lambda on_done, profile=None: on_done(None)
    with pytest.raises(RuntimeError, match="Could not get a compute node"):
        tools.agent_start("wulver", "agy")


def test_ask_all_asks_for_a_node_with_your_choice(env):
    env.s.allocation = None
    got = tools.ask_start("wulver", "~/thesis", "~/thesis/.hpc-hub/ask/1", "Which plot is best?\nmore",
                          ["claude", "cursor"], discuss=True, profile={"cpus": 4}, remember=True)
    assert got["node"] == "n0100" and got["title"] == "Ask all · Which plot is best?" and got["out"].endswith("/1")
    assert env.s.cfg.profile.cpus == 4 and env.s.asked[0][1].cpus == 4
    assert "base64 -d" in got["argv"][-1] and got["color"] == "#9141ac"
    with pytest.raises(ValueError):
        tools.ask_start("wulver", "~", "~/a", "  ", ["claude"])
    with pytest.raises(ValueError):
        tools.ask_start("wulver", "~", "~/a", "hi", [])


def test_vscode_find(env):
    env.s.ssh.answers = {"squeue -h -u": "991|hpc-hub-vscode|n0007|general\n", "%C|%m": "2|8G|0:10|8:00:00",
                         "grep -ao": "https://vscode.dev/tunnel/abc123/home/jdoe\n"}
    got = tools.vscode_find("wulver")
    assert got["job"]["id"] == "991" and got["job"]["node"] == "n0007" and got["tunnel"] == "abc123"
    assert "2 cores" in got["job"]["resources"]
    env.s.ssh.answers = {}
    assert tools.vscode_find("wulver") == {"job": None, "tunnel": ""}


def test_vscode_submits_a_job_and_follows_its_log(env):
    env.s.ssh.answers.update({"sbatch --parsable": "4242\n"})
    got = tools.vscode_start("wulver", "~/thesis", "browser", profile={"cpus": 4, "time": "01:00:00"}, remember=True)
    assert got["submitted"] == "4242" and got["folder"] == "/home/jdoe/thesis" and got["target"] == "browser"
    assert "4242" in got["follow"]["argv"][-1] and got["follow"]["title"] == "VS Code · Wulver · job 4242"
    v = env.s.cfg.vscode
    assert v.open_in == "browser" and v.compute.cpus == 4 and v.workdir == "~"  # a project folder isn't the default
    assert any("--cpus-per-task=4" in r for r in env.s.ssh.ran)


def test_vscode_uses_the_running_job(env, monkeypatch):
    monkeypatch.setattr(tools.shutil, "which", lambda name: None)
    env.s.ssh.answers.update({"grep -ao": "https://vscode.dev/tunnel/abc123/home/jdoe\n"})
    got = tools.vscode_start("wulver", "~/thesis", "desktop", job="991")
    assert got["open"] == {"app": False, "url": "https://vscode.dev/tunnel/abc123/home/jdoe/thesis", "missing": True}
    assert not any("sbatch" in r or "scancel" in r for r in env.s.ssh.ran)
    env.s.ssh.answers["grep -ao"] = ""  # still in the queue: follow it until it prints the tunnel
    assert "follow" in tools.vscode_start("wulver", "", "desktop", job="991")


def test_vscode_saves_ask_every_time(env):
    env.s.ssh.answers.update({"sbatch --parsable": "4242\n"})
    assert env.s.cfg.vscode.ask and tools.setup("wulver")["vscode"]["ask"]
    tools.vscode_start("wulver", "", "desktop", ask=False)
    assert not env.s.cfg.vscode.ask and not tools.setup("wulver")["vscode"]["ask"]


def test_vscode_replaces_the_running_job(env):
    env.s.ssh.answers.update({"sbatch --parsable": "5000\n"})
    got = tools.vscode_start("wulver", "", "desktop", job="991", replace_job=True)
    assert got["submitted"] == "5000" and "scancel 991" in env.s.ssh.ran


def test_vscode_open_in_the_app(monkeypatch):
    started = []
    monkeypatch.setattr(tools.shutil, "which", lambda name: "/usr/bin/code")
    monkeypatch.setattr(tools.subprocess, "Popen", lambda argv, **kw: started.append(argv))
    assert tools.vscode_open("abc123", "/home/jdoe", "desktop")["app"]
    assert started == [["code", "--folder-uri", "vscode-remote://tunnel+abc123/home/jdoe"]]
    assert tools.vscode_open("abc123", "/home/jdoe", "browser")["url"] == "https://vscode.dev/tunnel/abc123/home/jdoe"
    with pytest.raises(ValueError):
        tools.vscode_open("abc; rm", "/")


def test_forward_a_node_web_server(env):
    assert tools.forward("wulver", "http://localhost:8000/?tkn=x", node="n0042") == "http://127.0.0.1:50123/?tkn=x"
    assert env.s.ssh.forwarded == ("n0042", 8000)
    with pytest.raises(ValueError):
        tools.forward("wulver", "https://example.com")
