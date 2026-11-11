"""The whole backup on a stand-in cluster: scan, plan, trial run, copy and check. Scratch must come out exactly as
it went in, and only the planned files may land in project."""

import json
import os
import signal
import subprocess
import time
from pathlib import Path

import pytest

from hpc_hub.backup import copy, plan, scan
from hpc_hub.backup.model import Destination, Purge
from hpc_hub.core.config import ComputeProfile

from .conftest import snapshot

PURGE = Purge(days=30, basis="mtime")


def work(cluster, scan_id):
    return cluster.home / ".hpc-hub/backup" / scan_id


def run_scan(cluster, purge=PURGE, horizon=14):
    scan_id = scan.new_id()
    job = scan.script(scan_id, str(cluster.scratch), purge, horizon, ComputeProfile())
    res = cluster.run(scan.start_command(scan_id, {"id": scan_id}, job))
    assert res.returncode == 0, res.stderr
    d = work(cluster, scan_id)
    assert (d / "state").read_text().strip() == "done", (d / "find.err").read_text()
    return scan_id, json.loads((d / "summary.json").read_text())


def make_plan(cluster, summary, quota_gb=100.0, used_gb=1.0):
    dest = Destination(path=str(cluster.project), label="Project", used_gb=used_gb, quota_gb=quota_gb)
    return plan.build(summary, dest)


def job(cluster, scan_id, p, mode):
    j = copy.script(mode, scan_id, str(cluster.scratch), p.dest, "", p.hash, ComputeProfile(),
                    hardlinks=True, total_bytes=p.bytes)
    res = cluster.run(copy.start_command(scan_id, mode, j, plan.rules_json(p) if mode == "dry" else ""))
    assert res.returncode == 0, res.stderr
    return (work(cluster, scan_id) / "copy.state").read_text().strip()


def copied(cluster):
    dest = cluster.project / "from-scratch"
    return {str(p.relative_to(dest)) for p in dest.rglob("*") if (p.is_file() or p.is_symlink())
            and ".hpc-hub" not in p.parts and p.name != "BACKUP-NOTES.md"}


def test_scan_plan_try_copy_check(cluster, tree):
    before = snapshot(cluster.scratch)
    scan_id, summary = run_scan(cluster)
    assert summary["files"] == 19 and summary["at_risk_files"] == 18  # all but today's file
    assert summary["hardlinks"] == 2 and summary["soonest_days"] < 0
    folders = {f["path"]: f for f in summary["folders"]}
    assert folders["proj"]["git"] and folders["proj"]["links_out"] == 2 and folders["proj"]["sparse"] == 1
    p = make_plan(cluster, summary)
    kept = {(i.folder, i.kind) for i in p.items}
    assert ("runs/sweep/results", "results") in kept and ("runs/sweep", "code") in kept
    assert ("runs/sweep/__pycache__", "regen") not in kept

    assert job(cluster, scan_id, p, "dry") == "tried"
    dry = json.loads((work(cluster, scan_id) / "dry.json").read_text())
    assert dry["hash"] == p.hash and dry["files"] > 0 and dry["will_replace"] == 0
    assert copied(cluster) == set()  # a trial run copies nothing

    assert job(cluster, scan_id, p, "copy") == "done"
    got = copied(cluster)
    assert {"runs/sweep/results/table.csv", "runs/sweep/results/plot.png", "runs/sweep/train.py",
            "proj/main.c", "proj/-rf", "proj/new\nline.txt", "proj/tab\tname.csv", "proj/résumé.md",
            "proj/.git/config", "proj/inside_link", "proj/outside_link", "proj/dangling_link"} <= got
    assert "runs/sweep/ckpt_epoch3.pt" in got  # the newest checkpoint goes anyway
    assert not {"runs/sweep/ckpt_epoch1.pt", "runs/sweep/ckpt_epoch2.pt"} & got
    assert not any("__pycache__" in g for g in got) and "runs/sweep/new_today.csv" not in got
    dest = cluster.project / "from-scratch"
    assert os.path.islink(dest / "proj/outside_link")  # links stay links, never followed
    assert os.readlink(dest / "proj/outside_link") == "/etc/hostname"
    result = json.loads((work(cluster, scan_id) / "result.json").read_text())
    assert result["mismatches"] == 0 and result["verified"] == "checksum" and not result["failed"]
    notes = (dest / "BACKUP-NOTES.md").read_text()
    assert "Nothing in scratch was changed or deleted" in notes and "Left out" in notes

    assert snapshot(cluster.scratch) == before  # not one file in scratch changed, moved or went away


def test_copy_needs_the_trial_run_of_the_same_plan(cluster, tree):
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    assert job(cluster, scan_id, p, "copy") == "failed"
    assert "Try it first" in (work(cluster, scan_id) / "copy.why").read_text()
    assert job(cluster, scan_id, p, "dry") == "tried"
    other = plan.build(summary, Destination(str(cluster.project), "Project", quota_gb=100),
                       choices=[{"path": "runs/sweep", "class": "code", "keep": False}])
    assert other.hash != p.hash and job(cluster, scan_id, other, "copy") == "failed"  # changed after the trial run
    assert copied(cluster) == set()


def test_refuses_without_space(cluster, tree):
    (cluster.bin / "df").write_text("#!/bin/bash\necho 'Filesystem 1024-blocks Used Available Capacity Mounted'\n"
                                    "echo 'fake 100 99 1 99% /'\n")
    (cluster.bin / "df").chmod(0o755)
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    assert job(cluster, scan_id, p, "dry") == "failed"
    assert "Not enough space" in (work(cluster, scan_id) / "copy.why").read_text()
    assert copied(cluster) == set()


def test_destination_must_be_from_scratch_outside_scratch(cluster, tree):
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    inside = str(cluster.scratch / "x" / "from-scratch")
    j = copy.script("dry", scan_id, str(cluster.scratch), inside, "", p.hash, ComputeProfile())
    cluster.run(copy.start_command(scan_id, "dry", j, plan.rules_json(p)))
    assert "inside scratch" in (work(cluster, scan_id) / "copy.why").read_text()
    j = copy.script("dry", scan_id, str(cluster.scratch), str(cluster.project), "", p.hash, ComputeProfile())
    cluster.run(copy.start_command(scan_id, "dry", j, plan.rules_json(p)))
    assert "from-scratch" in (work(cluster, scan_id) / "copy.why").read_text()
    with pytest.raises(ValueError):
        plan.check_dest(inside, [Destination(str(cluster.scratch / "x"), "Project")], str(cluster.scratch))


def test_newer_files_in_project_win_and_replaced_ones_are_kept(cluster, tree):
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    assert job(cluster, scan_id, p, "dry") == "tried" and job(cluster, scan_id, p, "copy") == "done"
    dest = cluster.project / "from-scratch"
    mine = dest / "runs/sweep/train.py"
    mine.write_text("my newer edit\n")  # changed in project after the copy
    old = dest / "proj/main.c"
    old.write_text("older and different\n")
    t = time.time() - 60 * 86400
    os.utime(old, (t, t))
    before = snapshot(cluster.scratch)
    assert job(cluster, scan_id, p, "dry") == "tried"
    assert json.loads((work(cluster, scan_id) / "dry.json").read_text())["will_replace"] == 1
    assert job(cluster, scan_id, p, "copy") == "done"
    assert mine.read_text() == "my newer edit\n"  # --update: never overwritten
    assert old.read_text() == "int main(){}\n"
    kept = list((dest / ".hpc-hub-replaced").rglob("main.c"))
    assert len(kept) == 1 and kept[0].read_text() == "older and different\n"
    assert snapshot(cluster.scratch) == before


def test_a_killed_copy_starts_again_where_it_was(cluster, tree):
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    assert job(cluster, scan_id, p, "dry") == "tried"
    d = work(cluster, scan_id)
    (d / "copy.sbatch").write_text(copy.script("copy", scan_id, str(cluster.scratch), p.dest, "", p.hash,
                                               ComputeProfile(), hardlinks=True, total_bytes=p.bytes))
    proc = subprocess.Popen(["bash", "copy.sbatch"], cwd=d, env={**cluster.env, "SLOW_RSYNC": "1"},
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    end = time.time() + 20
    while time.time() < end and (d / "copy.state").read_text().strip() != "copying":
        time.sleep(0.1)
    os.killpg(proc.pid, signal.SIGKILL)  # the node went away
    proc.wait(timeout=20)
    before = snapshot(cluster.scratch)
    assert job(cluster, scan_id, p, "copy") == "done"
    assert json.loads((d / "result.json").read_text())["mismatches"] == 0
    assert snapshot(cluster.scratch) == before


def test_the_weekly_check_scans_like_a_scan_by_hand(cluster, tree):
    from hpc_hub.agents import catalog, schedules
    from hpc_hub.backup import remind
    from hpc_hub.core.config import AgentSettings
    sc = remind.schedule(str(cluster.scratch), PURGE, "wulver")
    text = schedules.script(sc, catalog.CLAUDE, AgentSettings(), ComputeProfile())
    sdir = cluster.home / "sched"
    sdir.mkdir()
    (sdir / "run.sbatch").write_text(text.replace(schedules.folder_of(sc.name), str(sdir), 1))
    res = subprocess.run(["bash", "run.sbatch"], cwd=sdir, env={**cluster.env, "HPCHUB_ONCE": "1"},
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    found = list((cluster.home / ".hpc-hub/backup").glob("*/summary.json"))
    assert len(found) == 1 and json.loads(found[0].read_text())["at_risk_files"] == 18
    assert (found[0].parent / "state").read_text().strip() == "done"
    assert scan.ID.match(found[0].parent.name)


def test_a_copy_out_of_time_goes_on_in_a_new_job(cluster, tree):
    scan_id, summary = run_scan(cluster)
    p = make_plan(cluster, summary)
    assert job(cluster, scan_id, p, "dry") == "tried"
    d = work(cluster, scan_id)
    j = copy.script("copy", scan_id, str(cluster.scratch), p.dest, "", p.hash, ComputeProfile(), hardlinks=True,
                    total_bytes=p.bytes)
    (d / "copy.sbatch").write_text(j)
    env = {**cluster.env, "SLOW_RSYNC": "1"}
    proc = subprocess.Popen(["bash", "copy.sbatch"], cwd=d, env=env, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL)
    end = time.time() + 20
    while time.time() < end and (d / "copy.state").read_text().strip() != "copying":
        time.sleep(0.1)
    time.sleep(0.5)
    proc.send_signal(signal.SIGUSR1)  # what Slurm sends five minutes before the time limit
    assert proc.wait(timeout=20) == 0
    assert (d / "copy.state").read_text().strip() == "resubmitted" and (d / "resubmits").read_text().strip() == "1"
    assert "HPCHUB_RESUBMIT=1" in Path(cluster.env["FAKE_SBATCH_LOG"]).read_text()
    res = subprocess.run(["bash", "copy.sbatch"], cwd=d, env={**cluster.env, "HPCHUB_RESUBMIT": "1"},
                         capture_output=True, text=True, timeout=60)
    assert res.returncode == 0 and (d / "copy.state").read_text().strip() == "done"
    assert "runs/sweep/results/table.csv" in copied(cluster)


def wait_for(path, text, seconds=20):
    for _ in range(int(seconds * 20)):
        if path.exists() and path.read_text().strip() == text:
            return True
        time.sleep(0.05)
    return False


def test_a_scan_runs_on_the_node_without_a_new_job(cluster):
    scan_id = scan.new_id()
    job = scan.script(scan_id, str(cluster.scratch), PURGE, 14, ComputeProfile())
    res = cluster.run(scan.start_command(scan_id, {"id": scan_id}, job, on_node=True))
    assert res.returncode == 0, res.stderr
    d = work(cluster, scan_id)
    assert res.stdout.strip() == (d / "pid").read_text().strip()
    assert wait_for(d / "state", "done"), (d / "slurm.out").read_text()
    assert (d / "summary.json").exists() and not (cluster.root / "sbatch.log").exists()


def test_cancelling_stops_a_scan_on_the_node(cluster):
    scan_id = scan.new_id()
    job = "#!/bin/bash\nsleep 30\necho done > state\n"
    cluster.run(scan.start_command(scan_id, {"id": scan_id}, job, on_node=True))
    d = work(cluster, scan_id)
    pid = (d / "pid").read_text().strip()
    time.sleep(0.2)
    cluster.run(scan.cancel_command(scan_id))
    assert (d / "state").read_text().strip() == "cancelled"
    for _ in range(100):
        if subprocess.run(["kill", "-0", pid], capture_output=True).returncode:
            return
        time.sleep(0.05)
    raise AssertionError("the scan is still running")

