"""Slurm only on a login shell's PATH (core/ssh.py find_slurm). 2026-11-18, a report from a Mac: every squeue failed
with 127 (command not found) right after signing in to Wulver, so the node form had no queues or groups to offer and
fell back to text boxes. Commands over ssh run without a login shell and find Slurm only if ~/.bashrc puts it on the
PATH; that account's didn't. Made-up homes and paths only."""

import os
import shutil
import subprocess
import sys

import pytest

from hpc_hub.core import ssh as ssh_mod
from hpc_hub.core.config import ClusterConfig

bash = pytest.mark.skipif(sys.platform == "win32" or not shutil.which("bash"), reason="the check runs in bash")


def home_with(tmp_path, profile: str = "", bashrc: str = "") -> dict:
    """A made-up home: a fake sinfo in ~/slurm/bin, put on the PATH by what profile says."""
    home = tmp_path / "home"
    (home / "slurm" / "bin").mkdir(parents=True)
    sinfo = home / "slurm" / "bin" / "sinfo"
    sinfo.write_text("#!/bin/sh\necho general\n")
    sinfo.chmod(0o755)
    (home / ".bash_profile").write_text(profile)
    (home / ".bashrc").write_text(bashrc)
    return {"HOME": str(home), "PATH": "/usr/bin:/bin", "TERM": "dumb"}


def check(env: dict) -> str:
    return subprocess.run(["bash", "--norc", "--noprofile", "-c", ssh_mod.FIND_SLURM], env=env, capture_output=True,
                          text=True, timeout=30).stdout


@bash
def test_slurm_only_in_the_login_profile_gives_its_path(tmp_path):
    env = home_with(tmp_path, profile='export PATH="$HOME/slurm/bin:$PATH"\n')
    out = check(env)
    path = next(line for line in out.splitlines() if line.startswith("@path="))[len("@path="):]
    assert os.path.join(env["HOME"], "slurm", "bin") in path.split(":")


@bash
def test_slurm_already_on_the_path_needs_nothing(tmp_path):
    env = home_with(tmp_path)
    env["PATH"] = os.path.join(env["HOME"], "slurm", "bin") + ":/usr/bin:/bin"
    assert check(env).strip() == "@ok"


@bash
def test_no_slurm_anywhere_says_nothing(tmp_path):
    env = home_with(tmp_path)
    assert "@path=" not in check(env) and "@ok" not in check(env)


@bash
def test_a_login_banner_is_not_taken_for_the_path(tmp_path):
    banner = 'echo "Welcome to the cluster. Quota: 50 GB"\n'
    env = home_with(tmp_path, profile=banner + 'export PATH="$HOME/slurm/bin:$PATH"\n')
    lines = check(env).splitlines()
    assert any(line.startswith("@path=") for line in lines) and not any("Welcome" in x for x in lines if "@" in x)


# -- the master: what it finds, and that every command gets it ------------------------------------------------

@pytest.fixture
def master(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    m = ssh_mod.SshMaster(ClusterConfig(id="t", name="Test", host="login.example.edu"), "jdoe", {}, lambda line: None)
    return m


def answer(m, monkeypatch, stdout: str):
    sent = []

    def plain(command, timeout):
        sent.append(command)
        return subprocess.CompletedProcess(command, 0, stdout, "")
    monkeypatch.setattr(m, "_run_plain", plain)
    return sent


def test_find_slurm_keeps_the_login_path(master, monkeypatch):
    answer(master, monkeypatch, "Welcome\n@path=/opt/slurm/bin:/usr/bin\n")
    master.find_slurm()
    assert master.slurm_path == "/opt/slurm/bin:/usr/bin"
    assert master.wrap("squeue -h") == "export PATH=/opt/slurm/bin:/usr/bin; squeue -h"
    assert master.wrap(master.wrap("squeue -h")) == master.wrap("squeue -h")  # never twice


def test_find_slurm_with_slurm_on_the_path_changes_nothing(master, monkeypatch):
    answer(master, monkeypatch, "@ok\n")
    master.find_slurm()
    assert master.slurm_path == "" and master.wrap("squeue -h") == "squeue -h"


def test_a_path_with_spaces_is_quoted(master):
    master.slurm_path = "/opt/my slurm/bin:/usr/bin"
    assert master.wrap("sinfo") == "export PATH='/opt/my slurm/bin:/usr/bin'; sinfo"


def test_a_broken_check_leaves_commands_alone(master, monkeypatch):
    def broken(command, timeout):
        raise subprocess.TimeoutExpired(command, timeout)
    monkeypatch.setattr(master, "_run_plain", broken)
    master.slurm_path = "/stale"
    assert not master.find_slurm(waits=())
    assert master.slurm_path == ""  # a new sign-in starts fresh


def test_every_way_a_command_runs_gets_the_path(master, monkeypatch):
    master.slurm_path = "/opt/slurm/bin"
    prefix = "export PATH=/opt/slurm/bin; "
    sent = answer(master, monkeypatch, "")
    master.on_login("squeue -h", fast=False)  # plain ssh
    master.run("sinfo -h")  # no job: the login node
    assert sent == [prefix + "squeue -h", prefix + "sinfo -h"]
    assert master.argv("sacct -j 1")[-1] == prefix + "sacct -j 1"  # what streams and terminals use
    launchers = master._launch({"launcher": "exec srun --jobid=7 --overlap bash --norc --noprofile"})
    assert launchers["launcher"].startswith(prefix + "exec srun")  # a node's kept shell needs srun
    assert master._launch({})["launcher"] == prefix + ssh_mod.BASH


def test_kept_shell_commands_get_the_path(master, monkeypatch):
    master.slurm_path = "/opt/slurm/bin"
    ran = []

    class Shell:
        def run(self, command, timeout):
            ran.append(command)
            return subprocess.CompletedProcess(command, 0, "", "")
    monkeypatch.setattr(master, "_take_shell", lambda: Shell())
    monkeypatch.setattr(master, "_return_shell", lambda shell: None)
    master.on_login("squeue -h")
    assert ran == ["export PATH=/opt/slurm/bin; squeue -h"]


def test_the_session_looks_once_signed_in():
    """_after_login asks the master before anything reads Slurm (the limits, a waiting job, the node)."""
    import inspect

    from hpc_hub.connect.session import ClusterSession
    src = inspect.getsource(ClusterSession._after_login)
    assert src.index("find_slurm()") < src.index("_read_limits()")


# -- a check that got no answer (2026-11-23 report from Windows, 0.2.7-beta.61: after signing in again every squeue
# and salloc said "command not found" until the next sign-in; the log never said where Slurm was) -----------------

LOGIN_PATH = "/opt/slurm/bin:/usr/bin"
MISSING = "bash: line 1: squeue: command not found"


class Cluster:
    """The login node: the check answers after `silent` tries; Slurm runs only with its login PATH."""

    def __init__(self, silent: int = 0):
        self.silent, self.sent = silent, []

    def __call__(self, command, timeout):
        self.sent.append(command)
        if command == ssh_mod.FIND_SLURM:
            if self.silent:
                self.silent -= 1
                return subprocess.CompletedProcess(command, 255, "", "Not connected to the cluster")
            return subprocess.CompletedProcess(command, 0, f"@path={LOGIN_PATH}\n", "")
        if command.startswith(f"export PATH={LOGIN_PATH}; "):
            return subprocess.CompletedProcess(command, 0, "1659999 n0042\n", "")
        tool = command.split()[0]
        return subprocess.CompletedProcess(command, 127, "", f"bash: line 1: {tool}: command not found")


@pytest.fixture
def cluster(master, monkeypatch):
    c = Cluster()
    monkeypatch.setattr(master, "_run_plain", c)
    monkeypatch.setattr(ssh_mod.time, "sleep", lambda s: None)
    return c


def test_a_check_with_no_answer_asks_again(master, cluster):
    cluster.silent = 1
    assert master.find_slurm() and master.slurm_path == LOGIN_PATH
    assert cluster.sent.count(ssh_mod.FIND_SLURM) == 2


def test_a_check_that_never_answers_says_so(master, cluster):
    logged = []
    master.log = logged.append
    cluster.silent = 10
    assert not master.find_slurm() and master.slurm_path == ""
    assert cluster.sent.count(ssh_mod.FIND_SLURM) == len(ssh_mod.FIND_WAITS) + 1
    assert any("Couldn't check where Slurm is" in line for line in logged)


def test_no_slurm_anywhere_is_an_answer_not_asked_again(master, monkeypatch):
    sent = []

    def plain(command, timeout):
        sent.append(command)
        return subprocess.CompletedProcess(command, 1, "", "")
    monkeypatch.setattr(master, "_run_plain", plain)
    assert master.find_slurm() and master.slurm_path == "" and len(sent) == 1


def test_squeue_not_found_looks_for_slurm_again_and_runs_once_more(master, cluster):
    cluster.silent = 10
    master.find_slurm()  # signed in: no answer
    cluster.silent = 0
    res = master.on_login("squeue -h -u jdoe", fast=False)
    assert res.returncode == 0 and res.stdout == "1659999 n0042\n"
    with_path = f"export PATH={LOGIN_PATH}; squeue -h -u jdoe"
    assert cluster.sent[-3:] == ["squeue -h -u jdoe", ssh_mod.FIND_SLURM, with_path]
    assert master.run("sinfo -h").returncode == 0  # later commands have it from the start
    assert cluster.sent[-1] == f"export PATH={LOGIN_PATH}; sinfo -h"


def test_on_the_jobs_node_too(master, cluster, monkeypatch):
    cluster.silent = 10
    master.find_slurm()
    cluster.silent = 0
    master.work_node = "n0042"
    on_node = []

    class Shell:
        def run(self, command, timeout):
            on_node.append(command)
            ok = command.startswith("export PATH=")
            return subprocess.CompletedProcess(command, 0 if ok else 127, "", "" if ok else MISSING)
    monkeypatch.setattr(master, "_shell_on", lambda node: Shell())
    assert master.run("squeue -h").returncode == 0
    assert on_node == ["squeue -h", f"export PATH={LOGIN_PATH}; squeue -h"]


def test_other_missing_commands_are_left_alone(master, cluster):
    res = master.on_login("nvidia-smi", fast=False)
    assert res.returncode == 127 and ssh_mod.FIND_SLURM not in cluster.sent


def test_looking_again_is_not_done_on_every_command(master, cluster, monkeypatch):
    monkeypatch.setattr(master, "_run_plain", lambda command, timeout: (
        cluster.sent.append(command),
        subprocess.CompletedProcess(command, 127 if command != ssh_mod.FIND_SLURM else 1, "", MISSING))[1])
    for _ in range(5):
        assert master.on_login("squeue -h", fast=False).returncode == 127
    assert cluster.sent.count(ssh_mod.FIND_SLURM) == 1  # Slurm isn't there at all: once a minute at most


def test_a_command_that_had_the_path_is_not_run_again(master, cluster):
    master.slurm_path = LOGIN_PATH
    res = subprocess.CompletedProcess("x", 127, "", MISSING)
    assert not master.slurm_found_late(f"export PATH={LOGIN_PATH}; squeue -h", res)
    assert not master.slurm_found_late("squeue -h", subprocess.CompletedProcess("x", 0, "", ""))


@pytest.mark.parametrize("err", ["bash: line 1: salloc: command not found", "sh: sbatch: not found",
                                 "bash: scontrol: command not found"])
def test_the_ways_a_shell_says_a_slurm_tool_is_missing(err):
    assert ssh_mod.SLURM_MISSING.search(err)


def test_salloc_not_found_gets_a_node_once_slurm_is_found(master, cluster, monkeypatch):
    from hpc_hub.compute import salloc
    from hpc_hub.core.config import ComputeProfile

    cluster.silent = 10
    master.find_slurm()
    cluster.silent = 0

    class Proc:
        def __init__(self, lines, code):
            self.stdout, self.code = iter(line + "\n" for line in lines), code

        def poll(self):
            return self.code

        wait = poll

        def terminate(self):
            pass
    started = []

    def popen(command, **kw):
        started.append(master.wrap(command))
        if started[-1].startswith("export PATH="):
            return Proc(["salloc: Granted job allocation 1659999"], 0)
        return Proc(["bash: line 1: salloc: command not found"], 127)
    monkeypatch.setattr(master, "popen", popen)
    a = salloc.allocate(master, ComputeProfile(), lambda line: None)
    assert a.job_id == "1659999" and len(started) == 2 and started[1].startswith(f"export PATH={LOGIN_PATH}; salloc ")


def test_salloc_refused_for_other_reasons_is_not_run_again(master, cluster, monkeypatch):
    from hpc_hub.compute import salloc, slurm
    from hpc_hub.core.config import ComputeProfile

    master.slurm_path = LOGIN_PATH
    started = []

    class Proc:
        stdout = iter(["salloc: error: Job submit/allocate failed: Invalid account\n"])

        def poll(self):
            return 1
        wait = poll
    monkeypatch.setattr(master, "popen", lambda command, **kw: started.append(command) or Proc())
    with pytest.raises(slurm.SlurmError, match="Invalid account"):
        salloc.allocate(master, ComputeProfile(), lambda line: None)
    assert len(started) == 1
