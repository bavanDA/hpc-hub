"""The backup agent's methods end to end on the stand-in cluster (tests/backup/conftest.py): the local bash runs
the scan, the trial run and the copy as the cluster would."""

import json
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import backup, backup_copy, backup_plan, backup_reminders
from hpc_hub.compute.usage.storage import Storage
from hpc_hub.core import config
from hpc_hub.files.remote_fs import Place
from tests.backup.conftest import Cluster, make_tree, snapshot


class FakeHub:
    def __init__(self, s):
        self.s = s

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError(f"Connect to {cluster} first")
        return self.s

    session = connected


@pytest.fixture
def env(tmp_path, monkeypatch):
    c = Cluster(tmp_path)
    make_tree(c)
    cfg = next(x for x in config.default_clusters() if x.id == "wulver")
    monkeypatch.setattr(hub_module, "_hub", FakeHub(SimpleNamespace(ssh=c, cfg=cfg)))
    rows = [Storage("mygroup project", 10, 100, 2, {"jdoe": 2.0, "other": 8.0}),
            Storage("mygroup scratch", 1, 100, 1, files=19), Storage("Home", 1, 50, 1)]
    monkeypatch.setattr(backup.quotas, "storage", lambda ssh, account: (rows, ""))
    places = [Place("Home", str(c.home)), Place("Project", str(c.project)), Place("Scratch", str(c.scratch))]
    monkeypatch.setattr(backup, "remote_fs", SimpleNamespace(places=lambda ssh: places, storage=lambda p: p))
    monkeypatch.setattr(backup_plan, "_plans", {})
    monkeypatch.setattr(backup, "_summaries", {})
    return c


def test_scan_plan_try_and_copy(env):
    before = snapshot(env.scratch)
    pol = backup.get_policy("wulver")
    assert pol["purge"]["days"] == 30 and pol["scratch"] == str(env.scratch)
    assert [d["label"] for d in pol["destinations"]] == ["Home", "Project"]
    assert pol["destinations"][1]["free_gb"] == 90.0 and pol["destinations"][1]["shared_with"] == 2

    started = backup.start_scan("wulver", horizon_days=14)
    assert started["job_id"] == "4242"
    listed = backup.scans("wulver")
    assert listed[0]["id"] == started["id"] and listed[0]["state"] == "done" and listed[0]["detail"] == "Done"
    s = backup.summary("wulver", started["id"])
    assert s["at_risk_files"] == 18 and s["destinations"]

    with pytest.raises(RuntimeError, match="Make the plan first"):
        backup_copy.dry_run("wulver", started["id"])
    p = backup_plan.make_plan("wulver", started["id"])
    assert p["dest"] == f"{env.project}/from-scratch" and not p["exact"] and p["space"]["fits"]
    with pytest.raises(RuntimeError, match="Try it first"):
        backup_copy.start("wulver", started["id"], confirm=p["hash"])
    with pytest.raises(ValueError):
        backup_plan.make_plan("wulver", started["id"], dest=str(env.scratch / "from-scratch"))

    backup_copy.dry_run("wulver", started["id"])
    p = backup_plan.make_plan("wulver", started["id"])
    assert p["exact"] and p["will_replace"] == 0
    with pytest.raises(RuntimeError, match="plan changed"):
        backup_copy.start("wulver", started["id"], confirm="0" * 16)

    out = backup_copy.start("wulver", started["id"], confirm=p["hash"])
    prog = backup_copy.progress("wulver", out["copy_id"])
    assert prog["state"] == "done" and prog["files_done"] == prog["files_total"] == p["files"]
    res = backup_copy.result("wulver", out["copy_id"])
    assert res["copied_files"] == p["files"] and res["mismatches"] == 0 and res["verified"] == "checksum"
    assert (env.project / "from-scratch/runs/sweep/results/table.csv").exists()
    assert snapshot(env.scratch) == before

    alerts = backup_reminders.alerts()
    assert alerts[0]["cluster"] == "wulver" and alerts[0]["title"].startswith("Scratch on Wulver")
    assert "—" not in alerts[0]["text"] and "–" not in alerts[0]["text"]


def test_your_choices_are_kept_for_later_scans(env):
    sid = backup.start_scan("wulver")["id"]
    p = backup_plan.make_plan("wulver", sid, changes=[{"path": "runs/sweep", "class": "code", "keep": False},
                                                 {"path": "bad"}])
    assert next(i for i in p["left_out"] if i["folder"] == "runs/sweep" and i["kind"] == "code")["by"] == "you"
    saved = json.loads((env.home / ".hpc-hub/backup/choices.json").read_text())
    assert saved == [{"path": "runs/sweep", "class": "code", "keep": False}]
    again = backup_plan.make_plan("wulver", sid)
    assert again["hash"] == p["hash"]


def test_reminders_are_a_scheduled_job(env):
    assert backup_reminders.reminders("wulver")["enabled"] is False
    got = backup_reminders.set_reminders("wulver", True, days=[1], time="03:00")
    assert got["enabled"] and got["days"] == [1]
    run = next((env.home / ".hpc-hub").rglob("backup-check/run.sbatch"))
    assert "summarize.py" in run.read_text()


def test_cancel_and_not_connected(env):
    sid = backup.start_scan("wulver")["id"]
    backup_copy.cancel("wulver", sid)
    assert backup.scans("wulver")[0]["state"] == "cancelled"
    with pytest.raises(RuntimeError, match="Connect"):
        backup.get_policy("yale")
    with pytest.raises(ValueError):
        backup.summary("wulver", "../../x")
