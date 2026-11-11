"""Asking an agent about code through the API, with a fake cluster."""

import base64
import io
import json
import subprocess
import tarfile

import pytest

from hpc_hub.api.methods import code_ask
from hpc_hub.code import asks
from hpc_hub.compute.slurm import Allocation
from hpc_hub.core import config


class FakeSsh:
    def __init__(self):
        self.ran, self.answers = [], []

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        for key, out in self.answers:
            if key in command:
                return subprocess.CompletedProcess(command, 0, out, "")
        return subprocess.CompletedProcess(command, 0, "", "")
    on_login = run


class FakeSession:
    def __init__(self, ssh, cfg):
        self.ssh, self.cfg, self.allocation = ssh, cfg, Allocation("123", "n0042")


class FakeHub:
    def __init__(self, session):
        self.s = session

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError(f"Connect to {cluster} first")
        return self.s


@pytest.fixture
def env(monkeypatch):
    ssh = FakeSsh()
    cfg = next(c for c in config.default_clusters() if c.id == "wulver")
    s = FakeSession(ssh, cfg)
    monkeypatch.setattr(code_ask, "hub", lambda: FakeHub(s))
    monkeypatch.setattr(code_ask.remote, "command_type", lambda ssh, name: "file")

    class Now:  # run the launch thread at once
        def __init__(self, target, args, daemon):
            self.target, self.args = target, args

        def start(self):
            self.target(*self.args)
    monkeypatch.setattr(code_ask.threading, "Thread", Now)
    monkeypatch.setattr(code_ask, "_pending", {})
    return ssh, s


def test_start_runs_the_agent_in_tmux_on_the_node(env):
    ssh, _ = env
    st = code_ask.ask_start("wulver", "~/proj/train.py", "claude", "explain", from_line=58, to_line=40)
    assert asks.ID.match(st["id"]) and st["kind"] == "explain"
    (line,) = [c for c in ssh.ran if "run.sh" in c]
    assert "n0042" in line and asks.SESSION_PREFIX + st["id"] in line  # tmux on the node, its own session
    run_sh = base64.b64decode(line.split("printf %s ")[2].split(" ")[0]).decode()
    (p_line,) = [x for x in run_sh.splitlines() if x.startswith("P=$(printf %s ")]
    prompt = base64.b64decode(p_line.split("printf %s ")[1].split(" |")[0]).decode()
    assert "--output-format json" in run_sh and "lines 40 to 58" in prompt  # Claude answers JSON; lines swapped
    assert code_ask._pending == {}  # the cluster has it now


def test_start_checks_what_you_send(env):
    with pytest.raises(ValueError, match="No agent"):
        code_ask.ask_start("wulver", "~/a.py", "nobody", "explain")
    with pytest.raises(ValueError, match="kind"):
        code_ask.ask_start("wulver", "~/a.py", "claude", "poem")
    with pytest.raises(ValueError, match="question"):
        code_ask.ask_start("wulver", "~/a.py", "claude", "free")
    with pytest.raises(ValueError, match="error"):
        code_ask.ask_start("wulver", "~/a.py", "claude", "fix")
    with pytest.raises(RuntimeError, match="Connect to yale"):
        code_ask.ask_start("yale", "~/a.py", "claude", "explain")


def test_a_missing_agent_fails_with_why(env, monkeypatch):
    monkeypatch.setattr(code_ask.remote, "command_type", lambda ssh, name: "")
    st = code_ask.ask_start("wulver", "~/a.py", "codex", "explain")
    got = code_ask.ask_status("wulver", st["id"])
    assert got["state"] == "failed" and "isn't installed" in got["detail"]
    assert [x["id"] for x in code_ask.list_asks("wulver")] == [st["id"]]


def test_status_and_list_come_from_the_cluster(env):
    ssh, _ = env
    meta = {"id": "20261101-120000-abcd", "kind": "fix", "agent": "claude", "agent_name": "Claude",
            "path": "~/p/a.py", "started": 10}
    ssh.answers.append(("asks", f"{json.dumps(meta)}\n{asks.LIST_SEP}running\n\n{asks.LIST_SEP}\n"))
    assert code_ask.ask_status("wulver", meta["id"])["detail"] == "Claude is reading a.py"
    assert code_ask.list_asks("wulver")[0]["state"] == "running"


def _tar(files: dict[str, str]) -> str:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, text in files.items():
            data = text.encode()
            info = tarfile.TarInfo("./" + name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    return base64.b64encode(buf.getvalue()).decode()


def test_result_gives_answer_and_proposals(env):
    ssh, _ = env
    ssh.answers.append(("tar -cz", _tar({"answer.md": "Use 0.01.\n", "root": "/home/jdoe/proj", "state": "done",
                                         "snapshot/train.py": "lr = 0.1\n", "proposed/train.py": "lr = 0.01\n",
                                         "proposed/tests/test_train.py": "def test(): pass\n"})))
    r = code_ask.ask_result("wulver", "20261101-120000-abcd")
    assert r["answer"] == "Use 0.01." and r["state"] == "done"
    new, changed = r["files"]
    assert new["path"] == "/home/jdoe/proj/tests/test_train.py" and new["is_new"] and new["original"] == ""
    assert changed["path"] == "/home/jdoe/proj/train.py" and changed["proposed"] == "lr = 0.01\n"


def test_cancel_stops_it_on_its_node(env):
    ssh, _ = env
    meta = {"id": "20261101-120000-abcd", "node": "n0042", "kind": "explain", "agent": "claude", "path": "~/a.py"}
    ssh.answers += [("meta.json 2>/dev/null", json.dumps(meta)),
                    ("asks", f"{json.dumps(meta)}\n{asks.LIST_SEP}cancelled\n\n{asks.LIST_SEP}\n")]
    assert code_ask.ask_cancel("wulver", meta["id"])["state"] == "cancelled"
    assert any("n0042" in c and "kill -TERM" in c for c in ssh.ran)
