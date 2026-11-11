import subprocess

import pytest

from hpc_hub.api.methods import terminals
from hpc_hub.compute.slurm import Allocation
from hpc_hub.terminals import tmux


class FakeSsh:
    """Records what would run on the cluster."""

    def __init__(self, out: str = ""):
        self.out, self.ran, self.on_node = out, [], {}

    def argv(self, command=None, tty=False):
        return ["ssh", *(["-tt"] if tty else []), "jdoe@cluster", *([command] if command else [])]
    node_argv = argv

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        return subprocess.CompletedProcess(command, 0, self.out, "")
    on_login = run

    def run_on_host(self, node, command, timeout=15):
        self.ran.append((node, command))
        return subprocess.CompletedProcess(command, 0, self.on_node.get(node, ""), "")


class FakeSession:
    def __init__(self, ssh, allocation=None):
        self.ssh, self.allocation = ssh, allocation


class FakeHub:
    def __init__(self, session):
        self.s = session

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError(f"Connect to {cluster} first")
        return self.s


@pytest.fixture
def ssh(monkeypatch):
    ssh = FakeSsh()
    monkeypatch.setattr(terminals, "hub", lambda: FakeHub(FakeSession(ssh, Allocation("123", "n0042"))))
    return ssh


def test_list_gives_sessions_with_colors(ssh):
    mine = tmux.SEP.join(["build", "100", "0", "Build", "#2ec27e", "bash", "1", "/home/jdoe"])
    agent = tmux.SEP.join(["hpchub-claude-123-0900", "200", "1", "", "", "srun", "1", "/h"])
    ssh.out = f"login1\nTMUX_OK\n{mine}\nSCREEN_LIST\nJOB_LIST\n123 n0042\nNODE_LIST\nn0042\n"
    ssh.on_node = {"n0042": f"{agent}\n"}
    got = terminals.sessions("wulver")
    assert got["host"] == "login1" and got["has_tmux"] and got["nodes"] == {"123": "n0042"}
    claude, build = got["sessions"]
    assert claude["node"] == "n0042" and claude["agent"] == "claude" and claude["job"] == "123"
    assert claude["color"] == tmux.AGENT_COLORS["claude"] and claude["title"] == claude["name"]
    assert build["title"] == "Build" and build["color"] == "#2ec27e" and build["node"] == ""
    assert (build["path"], claude["path"]) == ("/home/jdoe", "/h")  # the folder each one is in now


def test_not_connected_says_so(ssh):
    with pytest.raises(RuntimeError, match="Connect to yale first"):
        terminals.sessions("yale")


def test_attach_rides_ssh_with_a_tty(ssh):
    got = terminals.command("wulver", session="build")
    assert got["argv"][:2] == ["ssh", "-tt"] and got["argv"][-1].endswith("exec tmux attach-session -t =build")
    on_node = terminals.command("wulver", session="hpchub-claude-123-0900", node="n0042")
    assert "n0042" in on_node["argv"][-1] and on_node["node"] == "n0042"
    with pytest.raises(ValueError):
        terminals.command("wulver", session="x", kind="zsh")


def test_new_terminal_on_the_compute_node(ssh):
    got = terminals.command("wulver", new={"name": "Thesis", "node": True, "folder": "~/thesis", "color": "#e01b24"})
    line = got["argv"][-1]
    assert got["name"].startswith("hpchub-term-") and got["node"] == "n0042" and got["title"] == "Thesis"
    assert line.startswith("exec ssh") and "n0042" in line and "@hpchub_label" in line and "thesis" in line
    login = terminals.command("wulver", new={"name": "", "folder": ""})
    assert login["node"] == "" and login["title"] == "Terminal" and login["argv"][-1].startswith("if command -v tmux")


def test_new_terminal_needs_a_node_for_the_node(monkeypatch):
    monkeypatch.setattr(terminals, "hub", lambda: FakeHub(FakeSession(FakeSsh())))
    with pytest.raises(RuntimeError, match="No compute node"):
        terminals.command("wulver", new={"node": True})


def test_rename_and_stop_run_tmux(ssh):
    terminals.rename("wulver", "build", " New name ", node="n0042")
    terminals.stop("wulver", "1234.work", kind="screen")
    rename, stop = ssh.ran
    assert rename.startswith("ssh") and "n0042" in rename and "@hpchub_label" in rename and "=build:" in rename
    assert stop == "screen -S 1234.work -X quit"
    with pytest.raises(ValueError):
        terminals.rename("wulver", "build", "  ")
    assert len(ssh.ran) == 2


def test_tmux_buffer(ssh):
    ssh.out = "copied text\n"
    assert terminals.buffer("wulver") == "copied text" and "save-buffer" in ssh.ran[0]


def test_links_in_output():
    text = ("Open https://vscode.dev/tunnel/abc123/home/jdoe in a browser\n"
            "To sign in, use a web browser to open https://github.com/login/device and enter the code ABCD-1234")
    tunnel, device = terminals.links_in(text)
    assert tunnel["kind"] == "tunnel" and tunnel["tunnel"] == "abc123"
    assert device["kind"] == "device-login" and device["code"] == "ABCD-1234"
    assert terminals.links_in("see https://example.com") == []


def test_send_types_into_a_session_on_its_node(ssh):
    terminals.send("wulver", "hpchub-claude-123-0900", "fix line 3\nplease", node="n0042")
    (line,) = ssh.ran
    assert "n0042" in line and "paste-buffer -p" in line and "Enter" in line
    with pytest.raises(ValueError, match="Nothing"):
        terminals.send("wulver", "s", "   ")


def test_history_reads_on_the_sessions_node(monkeypatch):
    from hpc_hub.api.methods import terminal_history

    ssh = FakeSsh()
    monkeypatch.setattr(terminal_history, "hub", lambda: FakeHub(FakeSession(ssh)))
    terminal_history.read_history("wulver", "hpchub-term-1", node="n0042", start=5, count=10)
    assert ssh.ran[-1][0] == "n0042" and "capture-pane" in ssh.ran[-1][1]
    terminal_history.read_history("wulver", "build", start=None, count=10)
    assert isinstance(ssh.ran[-1], str) and "capture-pane" in ssh.ran[-1]


def test_marks_store_under_the_clusters_home(monkeypatch):
    from hpc_hub.api.methods import terminal_history

    ssh = FakeSsh()
    monkeypatch.setattr(terminal_history, "hub", lambda: FakeHub(FakeSession(ssh)))
    ssh.out = ""
    got = terminal_history.mark_add("wulver", "hpchub-term-1", "Table", 4, 2, "| a |\n| b |")
    assert got["name"] == "Table" and got["text"] == "| a |\n| b |"
    assert any("hpc-hub/marks" in c for c in ssh.ran if isinstance(c, str))
