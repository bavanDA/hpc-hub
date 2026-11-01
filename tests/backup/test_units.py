import ast
import io
import json
import os
import re
from pathlib import Path

import pytest

from hpc_hub.agents import catalog, schedules
from hpc_hub.backup import agent, copy, plan, policy, remind, scan, summarize
from hpc_hub.backup.classify import classify
from hpc_hub.backup.model import Destination, Purge
from hpc_hub.compute import usage
from hpc_hub.core.config import AgentSettings, ComputeProfile

FIX = Path(__file__).parent / "fixtures"
DAY = 86400
NOW = 1793534400.0


def fixture(name):
    text = (FIX / name).read_text()
    return json.loads(text) if name.endswith(".json") else text


# -- policy -------------------------------------------------------------------------------------------------------

def test_policies_and_the_purged_column():
    assert (policy.resolve("wulver").days, policy.resolve("wulver").sooner_when_full_pct) == (30, 80)
    assert (policy.resolve("sdsc").days, policy.resolve("sdsc").basis) == (90, "created")
    assert policy.parse_purged(fixture("getquota_bouchet.txt")) == 30
    assert policy.parse_purged("project GRP 1 2 3 4 Yes No\n") == 0
    yale = policy.resolve("yale", fixture("getquota_bouchet.txt").replace("30 days", "60 days"))
    assert (yale.days, yale.from_cluster) == (60, True)  # what the cluster says beats the docs
    assert policy.resolve("elsewhere").days == 0 and policy.days_left(NOW, Purge(days=0), NOW) is None


def test_the_timer_counts_from_the_oldest_date_when_not_known():
    a, m, c = NOW - 40 * DAY, NOW - 10 * DAY, NOW - 5 * DAY
    assert policy.stamp(a, m, c, 0, "oldest") == (a, False)
    assert policy.stamp(a, m, c, 0, "mtime") == (m, False)
    assert policy.stamp(a, m, c, 0, "created") == (m, True)  # no birth time: a guess, said so
    assert policy.stamp(a, m, c, NOW - 2 * DAY, "created") == (NOW - 2 * DAY, False)
    assert policy.days_left(a, Purge(days=30), NOW) == -10
    for args in ((a, m, c, 0, "oldest"), (a, m, c, 0, "created"), (a, m, c, NOW - DAY, "created")):
        assert summarize.when(*args) == policy.stamp(*args)


def test_storage_rows_carry_files_backup_and_purged():
    rows = usage.parse_getquota(fixture("getquota_bouchet.txt").splitlines())
    scratch = next(r for r in rows if r.label.endswith("scratch"))
    project = next(r for r in rows if r.label.endswith("project"))
    assert (scratch.files, scratch.file_limit, scratch.backup, scratch.purged) == (670344, 10000000, "No", 30)
    assert (project.backup, project.purged, project.mine) == ("Yes", 0, 1371)
    rows, _ = usage.parse_storage("@QUOTA\n" + fixture("quota_info_wulver.txt") + "@USERS\n")
    assert [r.label for r in rows] == ["mygroup project", "mygroup scratch", "Home"] and rows[0].files == 0


# -- sorting files ------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("path,kind", [
    ("run/results/table.csv", "results"), ("run/out.h5", "results"), ("run/train.py", "code"),
    ("repo/.git/objects/ab/cd", "code"), ("run/__pycache__/x.pyc", "regen"),
    ("env/lib/python3.11/site-packages/np/a.py", "regen"),
    ("node_modules/a/index.js", "regen"), ("run/ckpt_epoch3.pt", "checkpoint"), ("run/slurm-123.out", "logs"),
    ("paper/main.tex", "writing"), ("README.md", "writing"), ("cfg/params.yaml", "inputs"), ("x/blob.bin", "unsure"),
])
def test_classify(path, kind):
    assert classify(path) == kind


def test_summary_reads_odd_names_and_never_opens_files(tmp_path):
    def rec(path, days_old, size=10, kind="f", target=""):
        t = NOW - days_old * DAY
        return "\x1f".join(map(str, [t, t, t, "-", size, 8, 1, kind, target, path])).encode() + b"\0"

    names = ["a/new\nline.csv", "a/tab\tname.csv", "a/-rf", "a/résumé.md", "a/fresh.csv"]
    data = b"".join(rec(n, 1 if "fresh" in n else 40) for n in names) + rec("a/out", 40, kind="l", target="/etc")
    data += "\x1f".join(["1", "1", "1", "-", "1", "0", "1", "f", "", "a/bad\udcffbyte"]).encode(
        "utf-8", "surrogateescape") + b"\0"
    args = {"days": 30, "basis": "oldest", "horizon": 14, "now": NOW, "depth": 3, "busy": ["a"], "expected": 0,
            "scratch": str(tmp_path), "id": "x"}
    s = summarize.summarize(io.BytesIO(data), args, str(tmp_path))
    assert s["files"] == 7 and s["at_risk_files"] == 6
    f = s["folders"][0]
    assert f["path"] == "a" and f["links_out"] == 1 and f["busy"]
    listed = [os.fsdecode(r).split("\x1f")[-1] for r in (tmp_path / "files.list0").read_bytes().split(b"\0") if r]
    assert set(names) <= set(listed) and "a/bad\udcffbyte" in listed


def test_remote_scripts_run_on_old_python():
    for src in (scan.remote_source("classify", "summarize"), scan.remote_source("context"),
                scan.remote_source("listfilter")):
        assert "hpc_hub" not in src
        ast.parse(src, feature_version=(3, 6))
        assert not re.search(r"\b(list|dict|tuple)\[", src)  # 3.6 can't run these annotations


# -- the agent ----------------------------------------------------------------------------------------------------

def test_the_agent_answer_is_checked():
    raw = json.dumps({
        "folders": [{"path": "runs/a", "class": "regen", "keep": False, "why": "Can be made again — easily"},
                    {"path": "../../etc", "keep": True}, {"path": "/home/jdoe", "keep": True},
                    {"path": "runs/b", "class": "rm -rf", "keep": "yes"},
                    {"path": "runs/b", "class": "made-up", "keep": True, "why": "x\x1b[31m"}],
        "patterns": [{"folder": "runs/a", "glob": "ckpt_*.pt", "keep": False, "except_newest": 99},
                     {"folder": "runs/a", "glob": "../*", "keep": True},
                     {"folder": "runs/a", "glob": "$(rm -rf ~)", "keep": True},
                     {"folder": "runs/a", "glob": "a/b", "keep": True}],
        "summary": "Run `rm -rf /scratch` now", "commands": ["rm -rf /scratch"]})
    got = agent.validate(raw, ["runs/a", "runs/b"])
    assert got["folders"] == [{"path": "runs/a", "class": "regen", "keep": False, "why": "Can be made again, easily"},
                              {"path": "runs/b", "class": "", "keep": True, "why": "x[31m"}]
    assert got["patterns"] == [{"folder": "runs/a", "glob": "ckpt_*.pt", "keep": False, "except_newest": 0,
                                "why": ""}]
    assert "commands" not in got  # an answer is data: nothing in it is run
    assert agent.validate("not json", ["a"]) == agent.validate("[]", ["a"]) == {"folders": [], "patterns": [],
                                                                               "summary": ""}


def test_the_agent_gets_no_shell():
    line = agent.agent_command(catalog.CLAUDE, AgentSettings())
    assert "--disallowedTools Bash" in line and "--allowedTools Read,Write,Glob,Grep" in line
    assert "—" not in agent.prompt() and "–" not in agent.prompt()


# -- the plan -----------------------------------------------------------------------------------------------------

def project(**kw):
    return Destination(**{**fixture("summary.json")["destinations"][0], **kw})


def test_the_plan_fixture_is_what_build_makes():
    p = plan.build(fixture("summary.json"), project(), agent=fixture("agent.json"))
    assert plan.to_dict(p) == fixture("plan.json")


def test_plan_keeps_results_and_code_and_leaves_regen_out():
    p = plan.build(fixture("summary.json"), project(), agent=fixture("agent.json"))
    kept = {(i.folder, i.kind): i.by for i in p.items}
    left = {(i.folder, i.kind): i.by for i in p.left_out}
    assert kept[("runs/sweep-lr", "results")] == "rule" and ("runs/sweep-lr", "code") in kept
    assert ("proj/mdsim", "results") in kept  # a git repository goes whole
    assert left[("envs/torch", "regen")] == "rule" and left[("data/raw", "inputs")] == "agent"
    ckpt = next(r for r in p.rules if r["folder"] == "runs/sweep-lr" and r["class"] == "checkpoint")
    assert not ckpt["keep"] and ckpt["except_newest"] == 1
    assert not any(i.folder == "runs/today" for i in p.items + p.left_out)  # nothing at risk there yet
    assert round(p.bytes / plan.GB, 1) == 45.2 and p.space.fits and p.space.after_gb == 1508.2


def test_your_choices_beat_the_agent_and_change_the_hash():
    s, a = fixture("summary.json"), fixture("agent.json")
    base = plan.build(s, project(), agent=a)
    mine = plan.build(s, project(), agent=a, choices=[{"path": "data/raw", "keep": True}])
    assert ("data/raw", "inputs") in {(i.folder, i.kind) for i in mine.items}
    assert next(i for i in mine.items if i.folder == "data/raw").by == "you"
    assert mine.hash != base.hash and round(mine.bytes / plan.GB, 1) == 165.2


def test_space_says_when_it_does_not_fit():
    s = fixture("summary.json")
    tight = plan.build(s, project(used_gb=2040.0), choices=[{"path": "data/raw", "keep": True}])
    assert not tight.space.fits and "does not fit" in tight.space.warn and "8 GB free" in tight.space.warn
    files = plan.build(s, project(files=4_999_000))
    assert not files.space.fits and "files" in files.space.warn
    full = plan.build(s, project(used_gb=1800.0))
    assert full.space.fits and "fills project to 96%" in full.space.warn


def test_copies_only_go_to_from_scratch():
    dests = [project(), Destination("/home/jdoe", "Home")]
    assert plan.check_dest("/project/mygroup/jdoe/from-scratch", dests, "/scratch/jdoe")
    for bad in ("/project/mygroup/jdoe", "/project/mygroup/other/from-scratch", "/scratch/jdoe/from-scratch",
                "/project/mygroup/jdoe/from-scratch/../x"):
        with pytest.raises(ValueError):
            plan.check_dest(bad, dests, "/scratch/jdoe")
    with pytest.raises(ValueError):
        plan.check_dest("/scratch/jdoe/from-scratch", [Destination("/scratch/jdoe", "Project")], "/scratch/jdoe")


# -- rsync and the job scripts ------------------------------------------------------------------------------------

def test_rsync_only_gets_allowed_flags():
    for kind in ("dry", "copy", "check"):
        argv = copy.rsync_argv(kind, "copy.list0", "/s", "/p/from-scratch", hardlinks=True, checksum=True,
                               stamp="2026")
        assert not set(argv) & set(copy.FORBIDDEN)
    copy_argv = copy.rsync_argv("copy", "l", "/s", "/d")
    assert "--update" in copy_argv and "--backup" in copy_argv and "--partial" in copy_argv
    assert any(a.startswith("--backup-dir=/d/.hpc-hub-replaced/") for a in copy_argv)
    for bad in ("--delete", "--delete-after", "--remove-source-files", "-L", "--copy-links", "-a", "--chmod=777",
                "--inplace", "-e", "--rsh=ssh", "--exclude=*"):
        with pytest.raises(ValueError):
            copy.check_flags(["rsync", "-r", bad, "/s/", "/d/"])


def test_no_job_script_can_change_scratch():
    p = plan.build(fixture("summary.json"), project())
    scripts = [scan.script(scan.new_id(NOW), "/scratch/jdoe", Purge(days=30), 14, ComputeProfile(),
                           agent_cmd=agent.agent_command(catalog.CLAUDE, AgentSettings())),
               copy.script("dry", "20261101-120000-a1b2", "/scratch/jdoe", p.dest, "", p.hash, ComputeProfile()),
               copy.script("copy", "20261101-120000-a1b2", "/scratch/jdoe", p.dest, "/home/jdoe/from-scratch",
                           p.hash, ComputeProfile(), total_bytes=10 ** 13),
               remind.scheduled_script(remind.schedule("/scratch/jdoe", Purge(days=30), "wulver"), ComputeProfile())]
    for text in scripts:
        for word in ("--delete", "remove-source", "touch ", "chmod", "chown", "setfattr", "lfs migrate",
                     "lfs setstripe", "utime", "truncate", "unlink", "shutil", "rmdir"):
            assert word not in text
        for line in text.splitlines():
            assert not re.search(r"\b(rm|mv)\b.*\$S\b", line), line
    assert "--checksum" not in scripts[2].split("state verifying")[1].split("if [ -s mismatch")[0]  # 10 TB: quick
    assert "--signal=B:USR1@300" in scripts[2] and "--update" in scripts[2]


def test_progress_and_result():
    text = ("copying\x1f      1,234,567,890  42%   10.00MB/s    0:12:34 (xfr#120, to-chk=380/500)\r"
            "\x1f" + json.dumps({"files": 500, "bytes": 3_000_000_000}) + "\x1f2\x1f")
    p = copy.parse_progress(text)
    assert (p.done_bytes, p.eta_s, p.files_done, p.files_total, p.resubmits) == (1234567890, 754, 120, 500, 2)
    assert p.detail == "1.1 GB done, about 12 minutes left"
    failed = copy.parse_progress("failed\x1f\x1f\x1f\x1fNot enough space.")
    assert failed.state == "failed" and failed.detail == "Not enough space."
    assert copy.parse_result(json.dumps(fixture("result.json"))).mismatches == 0
    assert copy.parse_result("junk").copied_files == 0


def test_scan_ids_and_fetches_are_checked():
    with pytest.raises(ValueError):
        scan.check_id("../x")
    with pytest.raises(ValueError):
        scan.fetch_command(scan.new_id(NOW), "../../.ssh/id_ed25519")
    assert scan.job_profile(ComputeProfile(cpus=32, mem_gb=200, gpus=4), "sdsc").extra_args == "--constraint=lustre"


# -- reminders ----------------------------------------------------------------------------------------------------

def test_alerts_move_with_the_days():
    s = fixture("summary.json")
    a = remind.alert(s, s["started"])
    assert a["files"] == 892 + 1642 + 48210 and a["soonest_days"] == 1  # within the week
    later = remind.alert(s, s["started"] + 5 * DAY)
    assert later["files"] == a["files"] + 212 + 77 and later["soonest_days"] == 0
    assert remind.alert(s, s["started"], copied=10 ** 9) is None
    assert remind.alert({**s, "purge": {"days": 0}}, NOW) is None
    title, text = remind.message("Wulver", a)
    assert title == "Scratch on Wulver" and "tomorrow" in text and "—" not in text


def test_the_backup_check_is_a_scheduled_job():
    sc = remind.schedule("/scratch/jdoe", Purge(days=30), "wulver", days=[1, 4])
    assert sc.runner == "backup" and sc.name == remind.NAME
    text = schedules.script(sc, catalog.CLAUDE, AgentSettings(), ComputeProfile())
    assert "summarize.py" in text and "--begin" in text and "claude" not in text
    plain = schedules.script(schedules.Schedule(name="x", task="hi"), catalog.CLAUDE, AgentSettings(),
                             ComputeProfile())
    assert "summarize.py" not in plain
    st = schedules.parse_list("@@SCHED\n" + json.dumps({"name": "backup-check", "runner": "backup"}) + "\n")
    assert st[0].schedule.runner == "backup"


def test_the_demo_shows_the_fixtures():
    text = (Path(__file__).parents[2] / "app/src/demo/backup_data.ts").read_text()
    found = dict(re.findall(r"^export const (\w+): \w+ = (.*)$", text, re.M))
    assert {k: json.loads(v) for k, v in found.items()} == {n: fixture(f"{n}.json")
                                                             for n in ("summary", "plan", "result")}
