from hpc_hub.compute import usage


def test_group():
    text = ("@QOS\nlow|0.000000\nstandard|1.000000\n@JOBS\nme|standard|100.0\nme|low|40.0\nyou|low|5.0\n"
            "@NAMES\nme|Me Myself\nyou|You\nidle|Idle One\n")
    got = usage.parse_group(text)
    assert [(p.user, p.name, p.charged, p.hours) for p in got] == [
        ("me", "Me Myself", 100.0, 140.0), ("you", "You", 0.0, 5.0), ("idle", "Idle One", 0.0, 0.0)]


def test_storage():
    text = ("@QUOTA\nUsage for account: mygroup\n   SLURM Service Units: 1 CPU Hours (of 2 CPU Hour quota)\n"
            "   PROJECT Storage: 1463 GB (of 2048 GB quota)\n     User me Usage: 31 GB (No quota)\n"
            "   SCRATCH Storage: 7574 GB (of 10240 GB quota) \n     User me Usage: 7502 GB (No quota)\n"
            "HOME Storage me Usage: 46 GB (of 50 GB quota)\n"
            "@USERS\nyou|sata1-project_mygroup|2097152\nme|nvme1-scratch_mygroup|1048576\nzero|sata1-project_mygroup|0\n")
    rows, raw = usage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [
        ("mygroup project", 1463, 2048, 31), ("mygroup scratch", 7574, 10240, 7502), ("Home", 46, 50, 46)]
    assert rows[0].people == {"you": 2.0} and rows[1].people == {"me": 1.0} and raw == ""
    assert usage.parse_storage("@QUOTA\nFilesystem Size\n/home 1G\n@USERS\n") == ([], "Filesystem Size\n/home 1G")


def test_load():
    text = ("@PART\ngeneral*|up|97|11682/734/0/12416\ngpu|up|28|1373/1955/256/3584\n"
            "@GPU\ngpu|gpu:a100_40g:4,gpu:a100_10g:8|gpu:a100_40g:1(IDX:0),gpu:a100_10g:0(IDX:N/A)|\n"
            "general|(null)|(null)|\n@PEND\n    102 general\n@RUN\n    211 general\n     79 gpu\n")
    g, gpu = usage.parse_load(text)
    assert (g.name, g.cpus_used, g.cpus_total) == ("general", 11682, 12416)
    assert (g.pending, g.running, g.gpus_total) == (102, 211, 0)
    assert (gpu.gpus_used, gpu.gpus_total, gpu.pending) == (1, 12, 0)


def test_parse_usage():
    got = usage.parse_usage("mygroup|181080000|16076854|962138433\nnew|1500||\njunk\n")
    assert [(u.account, u.quota, u.used, u.mine) for u in got] == [
        ("mygroup", 3018000, 267947, 267260), ("new", 25, 0, 0)]


def test_expanse_su_and_lustre_storage():
    assert usage.parse_usage("abc123|SU|200000|11118|500\n") == [usage.AccountUsage("abc123", 200000, 11118, 500)]
    text = ("@QUOTA\nUsage for account: abc123\n   PROJECTS + SCRATCH Storage: 336 GB (of 51200 GB quota)\n"
            "     User jdoe Usage: 120 GB\n@USERS\n")
    rows, raw = usage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [("abc123 projects + scratch", 336, 51200, 120)]
    assert raw == ""


def test_scripts_are_valid_bash():
    import subprocess
    for script in (usage.USAGE, usage.STORAGE, usage.GROUP, usage.LOAD):
        assert subprocess.run(["bash", "-n", "-c", script]).returncode == 0
    assert "exit" not in usage.USAGE  # runs in the long-lived shell


def test_yale_getquota_and_accounts_without_limits():
    text = ("@QUOTA\nUsage Details for pi_abc group (oldest data as of Oct 24 2026 00:00)\n"
            "Fileset       User         Usage (GiB)      File Count\n"
            "project       jdoe               1371         152,083\n"
            "scratch       jdoe               2735          42,404\n"
            "Quota Summary for pi_abc group (oldest data as of Oct 24 2026 00:00)\n"
            "Fileset       Type   Usage (GiB)   Quota (GiB)     File Count     File Limit   Backup   Purged\n"
            "project       GRP           3126          4096      4,676,026      5,000,000   Yes      No\n"
            "scratch       GRP           7831         10240      5,150,632     15,000,000   No       30 days\n"
            "Notice: project storage usage is at 76% of its quota limit.\n"
            "home          USR             10           125         41,222        500,000   Yes      No\n@USERS\n")
    rows, raw = usage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [
        ("pi_abc project", 3126, 4096, 1371), ("pi_abc scratch", 7831, 10240, 2735), ("Home", 10, 125, 10)]
    assert raw == ""
    no_limits = usage.parse_usage("pi_abc||3944920|34787225\nprio_abc||600|3600\n")
    assert [(a.account, a.quota) for a in no_limits] == [("pi_abc", 0), ("prio_abc", 0)]
    assert [a.account for a in usage.parse_usage("a|60|0|0\nb||60|0\n")] == ["a"]  # limits known: those only


def test_yale_getusage():
    import json
    rows = [{"su_hours": 100.4, "username": "jdoe"}, {"su_hours": 50.0, "username": "other"},
            {"su_hours": 10.0, "username": "jdoe"}]
    text = (f"@USER jdoe\n@ACCOUNT pi_abc\n{json.dumps({'fy': 'FY27', 'bill_rate': 0.0049, 'rows': rows}, indent=2)}\n"
            "@ACCOUNT broken\nnot json\n")
    assert usage.parse_usage(text) == [usage.AccountUsage("pi_abc", 0, 160, 110, "FY27", 0.0049)]


# What WEEKLY prints on a cluster: QoS factors, then the awk sums per group, start day and QoS (D) and per group,
# person and QoS (U), sacct's exit code and the cluster's date.
WEEKLY = ("@QOS\nlow|0.000000\nstandard|1.000000\n@JOBS\n"
          "D|mygroup|2026-11-05|standard|100.00\nD|mygroup|2026-10-30|standard|70.00\n"
          "D|mygroup|2026-10-29|standard|30.00\nD|mygroup|2026-10-29|low|500.00\n"
          "D|mygroup|2026-08-01|standard|8.00\nD|abc123|2026-10-01|standard|12.50\nD|mygroup|Unknown|standard|9\n"
          "U|mygroup|jdoe|standard|150.00\nU|mygroup|jdoe|low|500.00\nU|mygroup|asmith|standard|58.00\n"
          "U|abc123|cwong|standard|12.50\nU|mygroup|bkim|low|40.00\njunk\n"
          "@RC 0\n@TODAY\n2026-11-05\n")


def test_weekly_sums_per_week_with_the_qos_factor():
    got = usage.parse_weekly(WEEKLY)
    mine = got["mygroup"]
    # today and 6 days ago fall in the last week, 7 days ago in the one before; low is free; a job that began
    # before the 12 weeks counts in the first one; one that never started counts nowhere
    assert mine.weeks == [8.0] + [0.0] * 9 + [30.0, 170.0]
    assert mine.people == {"jdoe": 150.0, "asmith": 58.0}  # bkim ran only free jobs
    assert got["abc123"].weeks[6] == 12.5 and sum(got["abc123"].weeks) == 12.5  # 35 days ago: week 7 of 12


def test_weekly_says_unknown_when_sacct_fails():
    assert usage.parse_weekly(WEEKLY.replace("@RC 0", "@RC 1")) is None
    assert usage.parse_weekly("@QOS\n@JOBS\n") is None  # cut off: no date, no exit code
    assert usage.parse_weekly("@QOS\n@JOBS\n@RC 0\n@TODAY\n2026-11-05\n") == {}  # nothing ran: real zeros


def test_pace_and_run_out_date():
    from datetime import date
    today = date(2026, 11, 5)
    w = usage.Weekly([0.0] * 8 + [700.0] * 4)  # 2,800 SUs in 4 weeks: 100 a day
    a = usage.pace(usage.AccountUsage("mygroup", 300000, 184520, 21340), w, today)
    assert (a.per_day, a.days_left, a.runs_out, a.near) == (100.0, 1154.8, "2030-01-02", False)
    a = usage.pace(usage.AccountUsage("abc123", 50000, 47500, 0), w, today)
    assert (a.days_left, a.runs_out, a.near) == (25.0, "2026-11-30", True)  # end not known: within 30 days
    a = usage.pace(usage.AccountUsage("abc123", 50000, 40000, 0), w, today, end="2026-12-31")
    assert (a.runs_out, a.near) == ("2027-02-13", False)  # lasts past the end
    a = usage.pace(usage.AccountUsage("abc123", 50000, 48000, 0), w, today, end="2026-12-31")
    assert (a.runs_out, a.near) == ("2026-11-25", True)  # runs out before the end
    a = usage.pace(usage.AccountUsage("idle", 1000, 10, 0), usage.Weekly([0.0] * 12), today)
    assert (a.per_day, a.days_left, a.runs_out, a.near) == (0.0, None, "", False)  # nothing used lately
    a = usage.pace(usage.AccountUsage("pi_doe", 0, 48210, 9120, "FY27", 0.012), w, today)
    assert (a.per_day, a.days_left, a.near) == (100.0, None, False)  # no limit: billed, never runs out
    a = usage.pace(usage.AccountUsage("full", 100, 120, 0), None, today)
    assert (a.weeks, a.per_day, a.near) == (None, None, True)  # weeks not known, but used up


def test_allocations_ask_sacct_once_and_keep_it(monkeypatch):
    import subprocess
    calls = []

    class Ssh:
        def run(self, command, timeout=60, fast=None):
            calls.append(command)
            out = WEEKLY if "@RC" in command else "mygroup|18000000|11071200|76824000\nabc123|3000000|2766000|0\n"
            return subprocess.CompletedProcess(command, 0, out, "")

    monkeypatch.setattr(usage, "_weekly_cache", {})
    got = usage.allocations(Ssh(), "wulver")
    assert [(a.account, a.quota, a.used, a.weeks is not None) for a in got] == [
        ("mygroup", 300000, 184520, True), ("abc123", 50000, 46100, True)]
    assert "abc123,mygroup" in calls[1] and len(calls) == 2
    usage.allocations(Ssh(), "wulver")
    assert len(calls) == 3  # the 12 weeks came from the cache
    usage.allocations(Ssh(), "wulver", fresh=True)
    assert len(calls) == 5


def test_weekly_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", usage.WEEKLY]).returncode == 0


def test_only_billed_partitions_count_where_the_cluster_says_so(tmp_path):
    """Yale bills its priority partitions only: a day job counts nothing there, and everything counts elsewhere."""
    import os
    import subprocess
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    (bin_ / "sacctmgr").write_text("#!/bin/sh\necho 'normal|1.000000'\n")
    (bin_ / "sacct").write_text("#!/bin/sh\ncat <<'X'\n"
                                "mygroup|jdoe|2026-11-02T10:00:00|normal|3600|cpu=4,billing=4|priority\n"
                                "mygroup|jdoe|2026-11-02T11:00:00|normal|7200|cpu=8,billing=8|day\n"
                                "X\n")
    for f in bin_.iterdir():
        f.chmod(0o755)
    env = {**os.environ, "PATH": f"{bin_}:/usr/bin:/bin"}

    def run(paid):
        out = subprocess.run(["bash", "-c", usage.WEEKLY, "_", "mygroup", paid], env=env,
                             capture_output=True, text=True).stdout
        return sorted(line for line in out.splitlines() if line.startswith("D|"))
    assert run("priority") == ["D|mygroup|2026-11-02|normal|4.00"]
    assert run("") == ["D|mygroup|2026-11-02|normal|20.00"]
