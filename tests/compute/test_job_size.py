"""hpchub-size: measuring finished jobs from sacct, and what a job should ask for. Canned sacct output only."""

from hpc_hub.compute import job_size
from hpc_hub.compute.sizing import hpchub_size
from hpc_hub.compute.sizing import size_advise as advise
from hpc_hub.compute.sizing import size_measure as m

# JobID|JobName|State|Elapsed|TotalCPU|AllocCPUS|ReqMem|MaxRSS|NNodes|NTasks|NodeList|Partition|WorkDir|SubmitLine
SACCT = """\
1001|train|COMPLETED|01:00:00|02:00:00|16|256G||1||n0042|general|/home/jdoe/proj|sbatch run.sh --seed 1
1001.batch|batch|COMPLETED|01:00:00|01:59:59|16||36000000K|1|1|n0042|||
1001.extern|extern|COMPLETED|01:00:00|00:00:01|16||1000K|1|1|n0042|||
1002|train|COMPLETED|01:10:00|02:20:00|16|256G||1||n0043|general|/home/jdoe/proj|sbatch --mem 9G -c4 -- run.sh --seed 1
1002.batch|batch|COMPLETED|01:10:00|02:19:59|16||40000000K|1|1|n0043|||
1003|train|RUNNING|00:10:00|00:00:00|16|256G||1||n0043|general|/home/jdoe/proj|sbatch run.sh --seed 1
1004|big|FAILED|00:20:00|00:19:00|4|16G||1||n0044|general|/home/jdoe/proj|sbatch big.sh
1004.batch|batch|OUT_OF_MEMORY|00:20:00|00:19:00|4||16777000K|1|1|n0044|||
1005|wrapped|CANCELLED by 51234|00:00:00|00:00:00|2|8G||1||None assigned|general|/home/jdoe|sbatch --wrap="python x.py"
1006_3|mpi|COMPLETED|00:30:00|04:00:00|16|4000Mc||2||n[0042-0043]|general|/home/jdoe/mpi|sbatch mpi.sh
1006_3.0|orted|COMPLETED|00:30:00|04:00:00|16||1G|2|16|n[0042-0043]|||
"""


def runs():
    return {r["id"]: r for r in m.parse_sacct(SACCT)}


def test_each_finished_job_is_one_run_with_the_peak_of_its_steps():
    got = runs()
    assert sorted(got) == ["1001", "1002", "1004", "1006_3"]  # running, and cancelled before it started: left out
    r = got["1001"]
    assert r["state"] == "COMPLETED" and r["elapsed"] == 3600 and r["cpu_s"] == 7200 and r["cpus"] == 16
    assert round(r["peak_mb"]) == 35156 and r["req_mb"] == 256 * 1024 and r["node"] == "n0042"
    assert r["kind"] == "/home/jdoe/proj/run.sh --seed 1" and r["script"] == "/home/jdoe/proj/run.sh"
    assert got["1002"]["kind"] == r["kind"]  # sbatch options before the script don't change the job
    assert got["1004"]["oom"] and got["1004"]["kind"] == "/home/jdoe/proj/big.sh"
    mpi = got["1006_3"]  # 16 tasks on 2 nodes: 8 of the biggest task on a node; 4000 MB a core, 8 cores a node
    assert mpi["peak_mb"] == 8 * 1024 and mpi["req_mb"] == 4000 * 8 and mpi["node"] == "n0042"


def test_the_words_of_sbatch():
    opts, script, args = m.split_sbatch(["--mem", "8G", "-c4", "--exclusive", "-p", "gpu", "--", "run.sh", "-x"])
    assert opts == {"mem": "8G", "cpus-per-task": "4", "exclusive": "", "partition": "gpu"}
    assert (script, args) == ("run.sh", ["-x"])
    assert m.split_sbatch(["--wrap=python x.py"])[0]["wrap"] == "python x.py"
    assert m.kind_of("", [], "/home/jdoe", "python  x.py") == "wrap: python x.py"
    assert m.split_sbatch(["-H", "job.sh"])[1] == "job.sh"  # -H takes no value


def test_directives_stop_at_the_first_command():
    text = "#!/bin/bash -l\n#SBATCH --mem=16G  # plenty\n#SBATCH -c 4\n# a comment\nmodule load x\n#SBATCH --mem=1G\n"
    assert m.directives(text) == {"mem": "16G", "cpus-per-task": "4"}


def test_units_and_times():
    assert m.megabytes("1.5G") == 1536 and m.megabytes("512K") == 0.5 and m.megabytes("") is None
    assert m.megabytes("2048", "B") == 2048 / 1048576
    assert m.seconds("1-02:03:04") == 93784 and m.seconds("12:34.500") == 754.5 and m.seconds("INVALID") == 0
    assert m.clock(93784) == "1-02:03:04" and m.gb(39062.5) == "38 GB" and m.gb(1536) == "1.5 GB"
    assert m.per_node("256Gn", 16, 2) == 256 * 1024 and m.per_node("512G", 16, 2) == 256 * 1024


def test_refresh_adds_new_jobs_once_and_looks_from_the_last_time():
    asked = []

    def run(argv):
        asked.append(argv)
        if argv[0] == "sinfo":
            return 0, "n0042|8\nn0043|128\nn0044|128\n"
        if argv[-1].endswith("SubmitLine"):
            return 1, ""  # old Slurm: no SubmitLine
        return 0, SACCT

    data = {"since": 0, "kinds": {}}
    assert m.refresh(data, now=1_800_000_000, run=run, user="jdoe")
    assert asked[1][-1] == m.FIELDS and data["since"] == 1_800_000_000
    assert sorted(data["kinds"]) == ["name: big", "name: mpi", "name: train"]  # known by their names
    assert data["kinds"]["name: mpi"][0]["whole"] and not data["kinds"]["name: train"][-1]["whole"]
    m.refresh(data, now=1_800_000_600, run=run, user="jdoe")
    assert len(data["kinds"]["name: train"]) == 2  # the same jobs again are not counted twice
    assert asked[-2][asked[-2].index("-S") + 1] == m.time.strftime("%Y-%m-%dT%H:%M:%S",
                                                                   m.time.localtime(1_800_000_000 - m.OVERLAP))
    assert not m.refresh(data, run=lambda argv: (1, ""))  # sacct down: the history stays
    assert len(data["kinds"]) == 3


def test_history_keeps_the_newest_runs_of_the_newest_jobs(monkeypatch):
    monkeypatch.setattr(m, "KEEP_RUNS", 2)
    monkeypatch.setattr(m, "KEEP_KINDS", 1)
    data = {"since": 0, "kinds": {}}
    m.merge(data, [{"id": str(i), "kind": "a"} for i in (9, 10, 11)] + [{"id": "8", "kind": "b"}], 5)
    assert data["kinds"] == {"a": [{"id": "10", "kind": "a"}, {"id": "11", "kind": "a"}]}


def _run(peak_gb, cpus=16, busy=2.0, req_gb=256, state="COMPLETED", oom=False, elapsed=3600):
    return {"id": "1", "state": state, "oom": oom, "elapsed": elapsed, "cpu_s": busy * elapsed, "cpus": cpus,
            "req_mb": req_gb * 1024, "peak_mb": peak_gb * 1024}


def test_the_suggestion_learns_its_margin():
    s = advise.suggest([_run(38)])
    assert s["margin"] == 1.2 and s["mem_mb"] == 46 * 1024 and s["cpus"] == 3 and s["time"] == 5400
    vary = advise.suggest([_run(20), _run(30), _run(40)])  # runs that vary get more room
    assert vary["margin"] == 1.53 and vary["mem_mb"] == 62 * 1024
    small = advise.suggest([_run(0.2, cpus=1, busy=0.9)])
    assert small["mem_mb"] == 2 * 1024 and small["cpus"] == 1  # 1 GB more than the peak at least
    oom = advise.suggest([_run(16, req_gb=16, oom=True, state="FAILED")])
    assert oom["oom"] and oom["oom_at_mb"] == 16 * 1024 and oom["mem_mb"] == 24 * 1024 and oom["time"] is None
    assert advise.suggest([_run(4, elapsed=30)])["cpus"] is None  # too short to say how busy the cores were


def _asked(mem_gb, cpus=16, fixable=True):
    return {"mem_mb": mem_gb * 1024, "cpus": cpus, "cores_fixable": fixable}


def test_advice_is_strict_only_for_jobs_that_share_a_node():
    s = advise.suggest([_run(38), _run(36)])
    partial = advise.advice(_asked(256), s, False, 2)
    assert [x["kind"] for x in partial] == ["memory", "cores"] and all(x["strict"] for x in partial)
    assert partial[0]["text"] == ("Asks for 256 GB, but used at most 38 GB in its last 2 runs. The rest sits unused "
                                  "while other jobs wait for it. Ask for 48 GB.")
    assert partial[0]["fix"] == {"mem_gb": 48} and partial[0]["label"] == "Use 48 GB"
    assert partial[1]["fix"] == {"cpus": 3} and partial[1]["label"] == "Use 3 cores"
    whole = advise.advice(_asked(256, cpus=128), s, True, 2)
    assert len(whole) == 1 and not whole[0]["strict"] and "blocks nobody" in whole[0]["text"]
    assert advise.advice(_asked(48), s, False, 2)[:1] == [x for x in partial if x["kind"] == "cores"]
    assert advise.advice(_asked(48, cpus=4), s, False, 2) == []  # about right: nothing to say
    mpi = advise.advice(_asked(48, fixable=False), s, False, 2)
    assert mpi[0]["kind"] == "cores" and mpi[0]["fix"] is None  # cores from tasks: no one-click change


def test_advice_when_it_ran_out_or_is_tight():
    oom = advise.advice(_asked(16, cpus=4), advise.suggest([_run(16, req_gb=16, oom=True)]), False, 1)
    assert oom[0]["kind"] == "oom" and oom[0]["fix"] == {"mem_gb": 24}
    assert "ran out of memory at 16 GB" in oom[0]["text"]
    tight = advise.advice(_asked(16, cpus=4), advise.suggest([_run(15.5, req_gb=16, busy=3)]), False, 1)
    assert tight[0]["kind"] == "tight" and tight[0]["fix"] == {"mem_gb": 19}
    late = advise.advice(_asked(20, cpus=4), advise.suggest([_run(15, busy=3, state="TIMEOUT")]), False, 1)
    assert [x["kind"] for x in late] == ["time"]


def test_report_finds_the_same_job_or_the_same_script():
    data = {"since": 0, "kinds": {}}
    m.merge(data, m.parse_sacct(SACCT), 1)
    opts = m.directives("#!/bin/bash\n#SBATCH --mem=256G\n#SBATCH --cpus-per-task=16\npython train.py\n")
    rep = advise.report(data["kinds"], opts, "run.sh", ["--seed", "1"], "/home/jdoe/proj", {"cores": 128})
    assert rep["match"] == "same" and len(rep["runs"]) == 2 and not rep["whole"]
    assert [x["kind"] for x in rep["advice"]] == ["memory", "cores"]
    other = advise.report(data["kinds"], opts, "run.sh", ["--seed", "2"], "/home/jdoe/proj", {})
    assert other["match"] == "script" and len(other["runs"]) == 2
    new = advise.report(data["kinds"], {}, "new.sh", [], "/home/jdoe/proj", {})
    assert new["match"] == "none" and new["advice"][0]["kind"] == "new" and new["suggest"] is None
    assert "--plan-only" in new["advice"][0]["text"]
    exclusive = advise.report(data["kinds"], dict(opts, exclusive=""), "run.sh", ["--seed", "1"], "/home/jdoe/proj", {})
    assert exclusive["whole"] and not any(x["strict"] for x in exclusive["advice"])
    unset = advise.report(data["kinds"], {}, "run.sh", ["--seed", "1"], "/home/jdoe/proj", {})
    assert unset["asked"]["mem_from"] == "last run" and unset["asked"]["mem_mb"] == 256 * 1024


def test_text_for_agents_has_the_flags_to_use():
    data = {"since": 0, "kinds": {}}
    m.merge(data, m.parse_sacct(SACCT), 1)
    opts = m.directives("#!/bin/bash\n#SBATCH --mem=256G\n#SBATCH -c 16\n")
    text = hpchub_size.show(advise.report(data["kinds"], opts, "run.sh", ["--seed", "1"], "/home/jdoe/proj", {}))
    assert "Suggested: --mem=51G --cpus-per-task=3 --time=01:50:00" in text
    assert "Warning: Asks for 256 GB" in text and "38 GB of 256 GB" in text


def test_the_details_window_says_what_a_job_used():
    text = (SACCT.splitlines()[0] + "\n" + SACCT.splitlines()[1] + "\n" + job_size.CORES + "\nn0042|128\n")
    rows = {r["label"]: r["value"] for r in job_size.usage_rows(text)}
    assert rows == {"Memory": "34 GB of 256 GB asked for", "Cores": "2.0 of 16 busy on average",
                    "Next time": "Ask for about 42 GB and 3 cores"}
    whole = {r["label"]: r["value"] for r in job_size.usage_rows(text.replace("n0042|128", "n0042|16"))}
    assert "Next time" not in whole  # it had the node to itself
    assert job_size.usage_rows("") == []
