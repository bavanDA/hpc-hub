import subprocess

import pytest

from hpc_hub.core import config
from hpc_hub.core.fastshell import NODE_SLOTS, FastShellError
from hpc_hub.core.ssh import NODE_SHELLS, SshMaster


class Shell:
    def __init__(self, launcher):
        self.launcher, self.alive, self.calls, self.error = launcher, True, 0, None

    def run(self, command, timeout=60):
        self.calls += 1
        if self.error:
            self.alive = False
            raise self.error
        return subprocess.CompletedProcess(command, 0, "out", "")

    def close(self):
        self.alive = False


def master(monkeypatch):
    m = SshMaster(config.default_clusters()[0], "jdoe", {}, lambda _: None)
    made = []

    def new(timeout=20, launcher="", slots=1):
        made.append(Shell(launcher))
        made[-1].slots = slots
        return made[-1]
    monkeypatch.setattr(m, "_new_shell", new)
    return m, made


def test_one_shell_stays_open_on_the_node(monkeypatch):
    m, made = master(monkeypatch)
    assert [m.run_on_host("n1", "x").stdout for _ in range(3)] == ["out"] * 3
    assert len(made) == 1 and made[0].calls == 3
    assert "ssh" in made[0].launcher and "n1" in made[0].launcher and "--norc" in made[0].launcher
    assert made[0].slots == NODE_SLOTS


def test_a_closed_shell_is_opened_again(monkeypatch):
    m, made = master(monkeypatch)
    m.run_on_host("n1", "x")
    made[0].alive = False
    assert m.run_on_host("n1", "x").stdout == "out" and len(made) == 2


def test_too_many_nodes_get_no_shell(monkeypatch):
    m, made = master(monkeypatch)
    for i in range(NODE_SHELLS):
        assert m.run_on_host(f"n{i}", "x")
    assert m.run_on_host("extra", "x") is None and len(made) == NODE_SHELLS
    assert m.run_on_host("n0", "x")  # the ones already open keep working


def test_a_shell_that_fails_gives_none(monkeypatch):
    m, made = master(monkeypatch)
    m.run_on_host("n1", "x")
    made[0].error = FastShellError("gone", sent=True)
    assert m.run_on_host("n1", "x") is None


def test_a_node_that_cannot_be_reached_gives_none(monkeypatch):
    m, _ = master(monkeypatch)

    def refuse(**_):
        raise FastShellError("no")
    monkeypatch.setattr(m, "_new_shell", refuse)
    assert m.run_on_host("n1", "x") is None


def test_read_prefers_the_jobs_node(monkeypatch):
    m, made = master(monkeypatch)
    m.work_node = "n1"
    assert m.read("squeue").stdout == "out" and "n1" in made[0].launcher


def test_read_uses_the_login_node_when_no_job_runs(monkeypatch):
    m, made = master(monkeypatch)
    login = subprocess.CompletedProcess("x", 0, "login", "")
    monkeypatch.setattr(m, "on_login", lambda *a, **k: login)
    assert m.read("squeue") is login and not made


def test_read_falls_back_when_the_node_is_gone_and_waits_before_trying_again(monkeypatch):
    m, _ = master(monkeypatch)
    login = subprocess.CompletedProcess("x", 0, "login", "")
    monkeypatch.setattr(m, "on_login", lambda *a, **k: login)
    tries = []

    def refuse(**_):
        tries.append(1)
        raise FastShellError("job over")
    monkeypatch.setattr(m, "_new_shell", refuse)
    m.work_node = "n1"
    assert m.read("squeue") is login and m.read("squeue") is login and len(tries) == 1


def test_read_falls_back_when_the_node_lacks_the_tool(monkeypatch):
    m, made = master(monkeypatch)
    m.work_node = "n1"
    m.run_on_host = lambda *a, **k: subprocess.CompletedProcess("x", 127, "", "not found")
    login = subprocess.CompletedProcess("x", 0, "login", "")
    monkeypatch.setattr(m, "on_login", lambda *a, **k: login)
    assert m.read("sshare") is login and not made


class Pooled(Shell):
    slots = 4


def test_one_shell_serves_several_commands(monkeypatch):
    m, _ = master(monkeypatch)
    made = []

    def new(**_):
        made.append(Pooled(""))
        return made[-1]
    monkeypatch.setattr(m, "_new_shell", new)
    taken = [m._take_shell() for _ in range(4)]
    assert len(made) == 1 and taken == made * 4 and m._take_shell() is made[1]


def test_a_dead_shell_is_counted_once(monkeypatch):
    m, _ = master(monkeypatch)
    made = []

    def new(**_):
        made.append(Pooled(""))
        return made[-1]
    monkeypatch.setattr(m, "_new_shell", new)
    a, b = m._take_shell(), m._take_shell()
    a.alive = False
    m._return_shell(a)
    m._return_shell(b)
    assert m._shells == 0 and not m._idle and not m._open


def test_with_a_job_everything_runs_on_its_node(monkeypatch):
    m, made = master(monkeypatch)
    m.work_node = "n1"
    monkeypatch.setattr(m, "on_login", lambda *a, **k: pytest.fail("ran on the login node"))
    assert m.run("git commit -m x").stdout == "out" and made[0].calls == 1


def test_without_a_job_it_runs_on_the_login_node(monkeypatch):
    m, made = master(monkeypatch)
    login = subprocess.CompletedProcess("x", 0, "login", "")
    monkeypatch.setattr(m, "on_login", lambda *a, **k: login)
    assert m.run("ls") is login and not made


def test_a_write_that_may_have_run_is_not_run_again(monkeypatch):
    m, made = master(monkeypatch)
    m.work_node = "n1"
    m.run("true")
    made[0].error = FastShellError("gone", sent=True)
    monkeypatch.setattr(m, "on_login", lambda *a, **k: pytest.fail("ran twice"))
    got = m.run("git commit -m x")
    assert got.returncode == 255 and "node" in got.stderr


def test_when_the_node_cannot_be_reached_it_uses_the_login_node(monkeypatch):
    m, _ = master(monkeypatch)
    m.work_node = "n1"
    monkeypatch.setattr(m, "_new_shell", lambda **_: (_ for _ in ()).throw(FastShellError("job over")))
    login = subprocess.CompletedProcess("x", 0, "login", "")
    monkeypatch.setattr(m, "on_login", lambda *a, **k: login)
    assert m.run("ls") is login


def test_data_fed_on_stdin_goes_to_the_node_too(monkeypatch):
    m, _ = master(monkeypatch)
    m.work_node = "n1"
    assert "ssh -o BatchMode=yes" in m.node_argv("cat > f")[-1] and "n1" in m.node_argv("cat > f")[-1]
    m.work_node = ""
    assert m.node_argv("cat > f")[-1] == "cat > f"

