import subprocess
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import jobs as m
from hpc_hub.compute import jobs
from hpc_hub.compute.slurm import Allocation

SQUEUE = ("7|vs|jdoe|general|RUNNING|1:30:00|4:00:00|4|16G|n1|standard\n"
          "9|wait|jdoe|general|PENDING|0:00|1-00:00:00|8|32G|(Priority)|low\n"
          "8|theirs|asmith|gpu|RUNNING|0:10:00|1:00:00|2|8G|n2|standard\n"
          f"{jobs.BILLING}\n7|cpu=4,billing=6|\n{jobs.QOS_LIST}\nlow|0.000000\nstandard|1.000000\n")
USAGE = "mygroup|60000|30000|7200\n"  # minutes, minutes, seconds
SCONTROL = ("JobId=7 JobName=vs\n   JobState=RUNNING Reason=None\n   RunTime=01:30:00 TimeLimit=04:00:00\n"
            "   StartTime=2026-10-19T17:07:01 EndTime=2026-10-19T21:07:01\n   NodeList=n1 NumCPUs=4\n"
            "   AllocTRES=cpu=4,mem=16G,node=1,billing=6,gres/gpu:a100=2\n   WorkDir=/home/jdoe/run\n"
            "   StdErr=/home/jdoe/run/out.txt StdOut=/home/jdoe/run/out.txt\n")


class FakeSsh:
    username = "jdoe"

    def __init__(self):
        self.ran: list[str] = []

    def run(self, command, timeout=60, fast=None):
        self.ran.append(command)
        out = (SQUEUE if command.startswith("squeue -h -u") else USAGE if "expanse-client" in command
               else SCONTROL if command.startswith("scontrol show job") else "")
        return subprocess.CompletedProcess(command, 0, out, "")


class FakeSession:
    def __init__(self, connected=True):
        self.cfg = SimpleNamespace(id="wulver", name="Wulver")
        self.ssh = FakeSsh()
        self.connected = connected
        self.allocation = None
        self.changed = 0
        self.listener = SimpleNamespace(state_changed=lambda s: setattr(s, "changed", s.changed + 1))


class FakeHub:
    def __init__(self, session):
        self.s = session

    def connected(self, cluster):
        if not self.s.connected:
            raise RuntimeError(f"Connect to {self.s.cfg.name} first")
        return self.s


@pytest.fixture
def session(monkeypatch):
    s = FakeSession()
    monkeypatch.setattr(hub_mod, "_hub", FakeHub(s))
    m._usage.clear()
    return s


def test_list_mine(session):
    got = m.list_jobs("wulver")
    a, b, c = got["jobs"]  # newest first
    assert [a["job_id"], b["job_id"], c["job_id"]] == ["9", "8", "7"]
    assert c["su"] == "9.0 / 24" and c["seconds"] == 5400 and c["cancellable"]
    assert a["su"] == "free" and a["cancellable"] and not b["cancellable"]  # not yours
    assert got["user"] == "jdoe" and got["accounts"][0] == {
        "account": "mygroup", "quota": 1000, "used": 500, "mine": 2, "period": "", "rate": 0.0}
    m.list_jobs("wulver")
    assert sum("sacctmgr -n -P show assoc" in c for c in session.ssh.ran) == 1  # totals are cached


def test_list_needs_a_connection(session):
    session.connected = False
    with pytest.raises(RuntimeError, match="Connect to Wulver first"):
        m.list_jobs("wulver")
    with pytest.raises(ValueError):
        m.list_jobs("wulver", "nope")


def test_details(session):
    got = m.details("wulver", "7")
    groups = {g["title"]: {r["label"]: r["value"] for r in g["rows"]} for g in got["groups"]}
    assert groups["Status"] == {"State": "Running", "Run time": "1 h 30 min of 4 h",
                                "Started": "Oct 19, 17:07", "Ends": "Oct 19, 21:07"}
    assert groups["Resources"]["Memory"] == "16 GB" and groups["Resources"]["GPU"] == "2 × A100"
    assert groups["Files"] == {"Work folder": "/home/jdoe/run", "Output": "/home/jdoe/run/out.txt"}
    assert got["text"].startswith("JobId=7")
    with pytest.raises(jobs.SlurmError):
        m.details("wulver", "7; rm -rf ~")


def test_details_read_like_words():
    assert m.state_text("PENDING", "Priority") == "Waiting: higher-priority jobs go first"
    assert m.state_text("CANCELLED by 4242") == "Cancelled" and m.state_text("TIMEOUT") == "Ran out of time"
    assert m.mem_text("64G") == "64 GB" and m.mem_text("500M") == "500 MB" and m.mem_text("1536G") == "1.5 TB"
    assert m.date_text("2026-10-04T09:31:05") == "Oct 4, 09:31"
    rows = m.detail_groups({"JobState": "PENDING", "Reason": "Resources", "TimeLimit": "3-00:00:00",
                            "Partition": "general", "QOS": "low", "Account": "mygroup"})
    status, res = ({r["label"]: r["value"] for r in g["rows"]} for g in rows[:2])
    assert status == {"State": "Waiting: not enough free nodes yet", "Run time": "3 days asked"}
    assert res == {"Queue": "general", "Billing": "low", "Charged to": "mygroup"}


def test_cancel_frees_the_app_node(session, monkeypatch):
    monkeypatch.setattr(jobs, "wait_gone", lambda ssh, job_id: True)
    session.allocation = Allocation("7", "n1")
    assert m.inside("wulver", "7")["app_node"] and not m.inside("wulver", "9")["app_node"]
    assert m.cancel("wulver", "7") == {"gone": True}
    assert "scancel 7" in session.ssh.ran and session.allocation is None and session.changed == 1


def test_submit_answers_the_job_id(session, monkeypatch):
    from hpc_hub.compute import slurm
    monkeypatch.setattr(slurm, "submit_file", lambda ssh, path: "4242" if path == "~/run.sbatch" else
                        (_ for _ in ()).throw(slurm.SlurmError("sbatch: error: invalid partition")))
    assert m.submit("wulver", "~/run.sbatch") == {"job_id": "4242"}
    with pytest.raises(ValueError, match="invalid partition"):
        m.submit("wulver", "~/bad.sbatch")


def test_exit_codes_in_words():
    from hpc_hub.api.methods.jobs import exit_text
    assert exit_text("0:0") == "0, finished without errors"
    assert exit_text("1:0") == "1, the program reported an error"
    assert exit_text("0:9") == "Stopped by signal 9"
    assert exit_text("") == ""
