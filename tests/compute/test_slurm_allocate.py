import subprocess

import pytest

from hpc_hub.compute import salloc, sbatch, slurm
from hpc_hub.core.config import ComputeProfile


class Proc:
    def __init__(self, lines: list[str], code: int):
        self.stdout, self.code, self.terminated = iter(line + "\n" for line in lines), code, False

    def poll(self):
        return self.code

    def wait(self):
        return self.code

    def terminate(self):
        self.terminated = True


class Ssh:
    """salloc prints lines, squeue answers the node; every command is kept."""

    def __init__(self, lines: list[str], code: int = 0, node: str = "n0042,n0043", answers: dict | None = None):
        self.proc, self.node, self.answers, self.ran = Proc(lines, code), node, answers or {}, []

    def popen(self, command, **kw):
        self.ran.append(command)
        return self.proc

    def run(self, command, timeout=60):
        self.ran.append(command)
        out = self.node if "-o %N" in command else next((v for k, v in self.answers.items() if k in command), "")
        return subprocess.CompletedProcess(command, 0, out, "")
    on_login = run


def test_granted_after_waiting_gives_the_first_node():
    ssh, pending, log = Ssh(["salloc: Pending job allocation 77", "", "salloc: Granted job allocation 77"]), [], []
    a = salloc.allocate(ssh, ComputeProfile(), log.append, on_pending=pending.append)
    assert (a.job_id, a.node, a.owned) == ("77", "n0042", True)
    assert pending == ["77"] and log == ["slurm: salloc: Pending job allocation 77",
                                         "slurm: salloc: Granted job allocation 77"]
    assert ssh.ran[0].startswith("salloc --no-shell --job-name=hpc-hub ") and not any("scancel" in c for c in ssh.ran)


def test_refused_says_why_and_cancels_what_it_got():
    ssh = Ssh(["salloc: Pending job allocation 78", "salloc: error: Job submit/allocate failed"], code=1)
    with pytest.raises(slurm.SlurmError, match="allocate failed"):
        salloc.allocate(ssh, ComputeProfile(), lambda line: None)
    assert "scancel 78" in ssh.ran


def test_cancelled_while_waiting():
    ssh = Ssh(["salloc: Pending job allocation 79"], code=0)
    with pytest.raises(slurm.SlurmError, match="Cancelled"):
        salloc.allocate(ssh, ComputeProfile(), lambda line: None, cancelled=lambda: True)
    assert "scancel 79" in ssh.ran


def test_bad_profile_never_reaches_slurm():
    ssh = Ssh([])
    with pytest.raises(slurm.SlurmError, match="Cores"):
        salloc.allocate(ssh, ComputeProfile(cpus=0), lambda line: None)
    with pytest.raises(slurm.SlurmError, match="Memory"):
        sbatch.submit(ssh, ComputeProfile(mem_gb=0), "x", "true")
    assert ssh.ran == []


def test_no_node_after_ten_tries(monkeypatch):
    monkeypatch.setattr(slurm.time, "sleep", lambda s: None)
    with pytest.raises(slurm.SlurmError, match="no node"):
        slurm.node_of(Ssh([], node=""), "80")


def test_submit_reads_the_job_id_or_the_error():
    ssh = Ssh([], answers={"sbatch --parsable": "4242;cluster\n"})
    assert sbatch.submit(ssh, ComputeProfile(), "hpc-hub-vscode", "code tunnel") == "4242"
    assert ssh.ran[0].startswith('mkdir -p "$HOME/.hpc-hub" && cd "$HOME/.hpc-hub" && printf %s ')
    with pytest.raises(slurm.SlurmError, match="sbatch failed"):
        sbatch.submit(Ssh([]), ComputeProfile(), "x", "true")


def test_running_jobs_and_their_resources():
    ssh = Ssh([], answers={"-t RUNNING": "5|hpc-hub|n1,n2|general\n6|pending||general\nbad\n",
                           "%C|%m": "16|64G|1:23:45|12:00:00\n"})
    assert slurm.running_jobs(ssh) == [slurm.Job("5", "hpc-hub", "n1", "general")]
    assert slurm.resources(ssh, "5") == "16 cores · 64G · 1:23:45 of 12:00:00"
    assert slurm.resources(Ssh([]), "5") == ""


def test_running_jobs_failing_is_not_no_jobs():
    class Down(Ssh):
        def run(self, command, timeout=60):
            return subprocess.CompletedProcess(command, 1, "", "squeue: error")
        on_login = run
    with pytest.raises(subprocess.CalledProcessError):
        slurm.running_jobs(Down([]))


def test_default_account_and_find_job():
    assert slurm.default_account(Ssh([], answers={"defaultaccount": "mygroup\n"})) == "mygroup"
    assert slurm.default_account(Ssh([])) == ""
    ssh = Ssh([], answers={"PENDING,RUNNING": "8|vscode|n3|gpu\n9|hpc-hub-vscode||gpu\n"})
    assert slurm.find_job(ssh, ["vscode", "hpc-hub-vscode"]).job_id == "9"
    assert slurm.find_job(Ssh([]), ["vscode"]) is None
