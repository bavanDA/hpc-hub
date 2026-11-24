"""After a laptop's sleep (2026-11-23, Windows): the VPN and the connection dropped, HPC Hub signed in again, and
its first squeue got no answer. That read as "the job ended", so the card said No compute node while the job (and
Claude on it) ran on. Slurm not answering is now "can't tell", and the node is kept."""

import subprocess
from types import SimpleNamespace

import pytest

from hpc_hub.compute import slurm
from hpc_hub.compute.slurm import Allocation
from hpc_hub.connect.session import ClusterSession, State


class Ssh:
    def __init__(self, res: subprocess.CompletedProcess):
        self.res, self.ran = res, []

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        return self.res

    def find_slurm(self):
        pass


def done(code: int, out: str = "", err: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess("squeue", code, out, err)


# -- job_state ------------------------------------------------------------------------------------------------

def test_a_running_job():
    assert slurm.job_state(Ssh(done(0, "RUNNING\n")), "1659999") == "RUNNING"


def test_a_job_that_left_the_queue_is_empty():
    assert slurm.job_state(Ssh(done(0, "")), "1659999") == ""
    gone = done(1, "", "slurm_load_jobs error: Invalid job id specified")
    assert slurm.job_state(Ssh(gone), "1659999") == ""


@pytest.mark.parametrize("res", [
    done(255, "", "connection to the cluster broke: Connection lost"),
    done(255, "", "Not connected to the cluster"),
    done(127, "", "bash: squeue: command not found"),
    done(1, "", "slurm_load_jobs error: Socket timed out on send/recv operation"),
])
def test_no_answer_from_slurm_is_not_an_ended_job(res):
    with pytest.raises(subprocess.CalledProcessError):
        slurm.job_state(Ssh(res), "1659999")


# -- signing in again --------------------------------------------------------------------------------------------

def session(res: subprocess.CompletedProcess, reuse=lambda: False):
    s = object.__new__(ClusterSession)
    s.ssh, s.lines, s.states, s.vpn_only = Ssh(res), [], [], False
    s.allocation = Allocation("1659999", "n0042")
    s.cfg = SimpleNamespace(request_node_on_connect=False, ask_node=False)
    s._read_limits = lambda: None
    s._reuse_running_job = reuse
    s._wait_for_earlier_request = lambda: False
    s._log = s.lines.append
    s._set = lambda state, detail="": s.states.append(state)
    return s


def test_signed_in_again_with_no_answer_from_slurm_keeps_the_node():
    s = session(done(255, "", "connection to the cluster broke"))
    s._after_login()
    assert s.allocation is not None and s.allocation.node == "n0042"
    assert s.states == [State.CONNECTED]
    assert any("Slurm didn't answer, so keeping job 1659999 on n0042" in line for line in s.lines)


def test_signed_in_again_with_the_job_running_reuses_it():
    s = session(done(0, "RUNNING\n"))
    s._after_login()
    assert s.allocation.job_id == "1659999" and "Reusing job 1659999 on n0042" in s.lines


def test_signed_in_again_after_the_job_really_ended_lets_it_go():
    s = session(done(1, "", "slurm_load_jobs error: Invalid job id specified"))
    s._after_login()
    assert s.allocation is None and s.states == [State.CONNECTED]
    assert not any("keeping job" in line for line in s.lines)


def test_with_no_node_nothing_is_asked():
    s = session(done(255))
    s.allocation = None
    s._after_login()
    assert s.ssh.ran == [] and s.allocation is None


def test_a_kept_node_is_checked_again_before_use():
    """check_node (before a terminal or an agent uses the node) lets it go only once Slurm says it ended."""
    s = session(done(255))
    s.state = State.CONNECTED
    s.check_node()
    assert s.allocation is not None  # still can't tell
    s.ssh.res = done(0, "")  # squeue answers: none running
    s._reuse_running_job = lambda: False
    s.check_node()
    assert s.allocation is None and "Job 1659999 on n0042 has ended" in s.lines
