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
    master.find_slurm()
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
