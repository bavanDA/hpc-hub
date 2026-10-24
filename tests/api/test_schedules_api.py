import json
import os

import pytest

from hpc_hub.agents import schedules
from hpc_hub.agents.schedules import Schedule
from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import schedules as m
from hpc_hub.core.config import ClusterConfig, ComputeProfile
from tests.helpers import LocalShell


class Session:
    def __init__(self):
        self.cfg = ClusterConfig("wulver", "Wulver", profile=ComputeProfile(cpus=4, mem_gb=16, account="mygroup"))
        self.ssh = LocalShell()


class FakeHub:
    def __init__(self):
        self.s = Session()

    def session(self, cluster):
        return self.s

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError("Connect to Yale first")
        return self.s


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A home folder and fake Slurm commands that only write down how they were called."""
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    for name in ("sbatch", "scancel", "squeue"):
        out = "echo 4242" if name == "sbatch" else "true"
        (bin_ / name).write_text(f'#!/bin/bash\necho "{name} $*" >> "$HOME/slurm.log"\n{out}\n')
        (bin_ / name).chmod(0o755)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PATH", f"{bin_}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setattr(hub_mod, "_hub", FakeHub())
    return tmp_path


def slurm(home):
    path = home / "slurm.log"
    return path.read_text() if path.exists() else ""


NEW = {"name": "clean thesis", "agent": "claude", "folder": "~/thesis", "task": "Tidy up.", "time": "02:00",
       "days": [5, 1, 1], "minutes": 90, "enabled": True}


def test_options_offer_agents_presets_and_the_node_settings(home):
    got = m.options("wulver")
    assert [a["id"] for a in got["agents"]] == ["claude", "codex", "agy", "cursor"]
    assert got["presets"][0]["label"] == "Clean the code" and got["presets"][-1]["task"] == ""
    assert got["profile"]["cpus"] == 4 and "extra_args" not in got["profile"] and got["days"][0] == "Mon"


def test_save_writes_files_and_queues(home):
    [st] = m.save("wulver", NEW)
    assert st["name"] == "clean-thesis" and st["days"] == [1, 5] and st["when"] == "Mon, Fri at 02:00"
    assert st["agent_name"] == "Claude" and st["compute"] == {}
    d = home / ".hpc-hub/schedules/clean-thesis"
    assert (d / "task.md").read_text() == "Tidy up." and (d / "enabled").exists()
    run = (d / "run.sbatch").read_text()
    assert "--cpus-per-task=4" in run and "--account=mygroup" in run and "--time=01:30:00" in run
    assert "sbatch --parsable --begin=" in slurm(home)
    with pytest.raises(ValueError, match="exists"):
        m.save("wulver", NEW)


def test_own_compute_and_rename(home):
    m.save("wulver", NEW)
    got = m.save("wulver", {**NEW, "name": "tidy", "compute": {"cpus": 8, "gpus": 1, "partition": "gpu",
                                                                "bogus": 1}}, old_name="clean-thesis")
    assert [st["name"] for st in got] == ["tidy"] and got[0]["compute"] == {"cpus": 8, "gpus": 1, "partition": "gpu"}
    run = (home / ".hpc-hub/schedules/tidy/run.sbatch").read_text()
    assert "--cpus-per-task=8" in run and "--gres=gpu:1" in run and "--partition=gpu" in run
    assert not (home / ".hpc-hub/schedules/clean-thesis").exists()


@pytest.mark.parametrize("bad, why", [({"task": " "}, "Write a task"), ({"time": "2am"}, "02:00"),
                                      ({"days": [0]}, "Days"), ({"minutes": 0}, "minute"), ({"agent": "vim"}, "agent"),
                                      ({"compute": {"cpus": "8"}}, "whole number"),
                                      ({"compute": {"partition": "gpu; rm"}}, "invalid")])
def test_save_refuses_bad_input(home, bad, why):
    with pytest.raises(ValueError, match=why):
        m.save("wulver", {**NEW, **bad})
    assert not (home / ".hpc-hub/schedules").exists()


def test_toggle_run_now_log_and_delete(home):
    m.save("wulver", NEW)
    [st] = m.toggle("wulver", "clean-thesis", False)
    assert not st["enabled"] and not (home / ".hpc-hub/schedules/clean-thesis/enabled").exists()
    assert json.loads((home / ".hpc-hub/schedules/clean-thesis/schedule.json").read_text())["enabled"] is False
    assert m.run_now("wulver", "clean-thesis") == {"job": "4242"} and "HPCHUB_ONCE=1" in slurm(home)
    assert m.log("wulver", "clean-thesis")["path"] == ""
    logs = home / ".hpc-hub/schedules/clean-thesis/logs"
    (logs / "2026-10-24-0200.md").write_text("  Done. Two files changed.\n")
    got = m.log("wulver", "clean-thesis")
    assert got["path"].endswith("2026-10-24-0200.md") and got["text"] == "  Done. Two files changed.\n"
    assert m.list_schedules("wulver")[0]["last_log"].endswith(".md")
    with pytest.raises(ValueError, match="No schedule"):
        m.run_now("wulver", "other")
    m.delete("wulver", "clean-thesis")
    assert m.list_schedules("wulver") == [] and "scancel --quiet --name=hpc-hub-sched-clean-thesis" in slurm(home)


def test_profile_for_keeps_the_node_settings_without_own_compute():
    base = ComputeProfile(cpus=2, mem_gb=8, partition="general")
    assert schedules.profile_for(Schedule("a"), base) == base
    assert schedules.profile_for(Schedule("a", compute={"mem_gb": 32}), base).mem_gb == 32
    with pytest.raises(ValueError, match="Cores"):
        schedules.profile_for(Schedule("a", compute={"cpus": 0}), base)
