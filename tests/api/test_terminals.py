import subprocess

import pytest

from hpc_hub.api.methods import terminals
from hpc_hub.compute.slurm import Allocation
from hpc_hub.terminals import tmux


class FakeSsh:
    """Records what would run on the cluster."""

    def __init__(self, out: str = ""):
        self.out, self.ran = out, []

    def argv(self, command=None, tty=False):
        return ["ssh", *(["-tt"] if tty else []), "jdoe@cluster", *([command] if command else [])]

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        return subprocess.CompletedProcess(command, 0, self.out, "")


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
    ssh.out = f"login1\nTMUX_OK\n{mine}\nSCREEN_LIST\nJOB_LIST\n123 n0042\nNODE_LIST\n@@NODE n0042\n{agent}\n"
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


def test_rename_color_stop_run_tmux(ssh):
    terminals.rename("wulver", "build", " New name ")
    terminals.set_color("wulver", "build", tmux.COLORS[1], node="n0042")
    terminals.stop("wulver", "1234.work", kind="screen")
    rename, color, stop = ssh.ran
    assert "@hpchub_label 'New name'" in rename and "=build:" in rename
    assert color.startswith("ssh") and "n0042" in color and tmux.COLORS[1] in color
    assert stop == "screen -S 1234.work -X quit"
    with pytest.raises(ValueError):
        terminals.set_color("wulver", "build", "red; rm -rf ~")
    with pytest.raises(ValueError):
        terminals.rename("wulver", "build", "  ")
    assert len(ssh.ran) == 3


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


def test_open_link_only_web(monkeypatch):
    opened = []
    monkeypatch.setattr(terminals.webbrowser, "open", opened.append)
    terminals.open_link("https://vscode.dev/tunnel/abc123")
    with pytest.raises(ValueError):
        terminals.open_link("file:///etc/passwd")
    assert opened == ["https://vscode.dev/tunnel/abc123"]


def test_send_types_into_a_session_on_its_node(ssh):
    terminals.send("wulver", "hpchub-claude-123-0900", "fix line 3\nplease", node="n0042")
    (line,) = ssh.ran
    assert "n0042" in line and "paste-buffer -p" in line and "Enter" in line
    with pytest.raises(ValueError, match="Nothing"):
        terminals.send("wulver", "s", "   ")
