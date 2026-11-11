from hpc_hub.compute.usage import weekly
from hpc_hub.compute.usage.accounts import AccountUsage

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
    got = weekly.parse_weekly(WEEKLY)
    mine = got["mygroup"]
    # today and 6 days ago fall in the last week, 7 days ago in the one before; low is free; a job that began
    # before the 12 weeks counts in the first one; one that never started counts nowhere
    assert mine.weeks == [8.0] + [0.0] * 9 + [30.0, 170.0]
    assert mine.people == {"jdoe": 150.0, "asmith": 58.0}  # bkim ran only free jobs
    assert got["abc123"].weeks[6] == 12.5 and sum(got["abc123"].weeks) == 12.5  # 35 days ago: week 7 of 12


def test_weekly_says_unknown_when_sacct_fails():
    assert weekly.parse_weekly(WEEKLY.replace("@RC 0", "@RC 1")) is None
    assert weekly.parse_weekly("@QOS\n@JOBS\n") is None  # cut off: no date, no exit code
    assert weekly.parse_weekly("@QOS\n@JOBS\n@RC 0\n@TODAY\n2026-11-05\n") == {}  # nothing ran: real zeros


def test_pace_and_run_out_date():
    from datetime import date
    today = date(2026, 11, 5)
    w = weekly.Weekly([0.0] * 8 + [700.0] * 4)  # 2,800 SUs in 4 weeks: 100 a day
    a = weekly.pace(AccountUsage("mygroup", 300000, 184520, 21340), w, today)
    assert (a.per_day, a.days_left, a.runs_out, a.near) == (100.0, 1154.8, "2030-01-02", False)
    a = weekly.pace(AccountUsage("abc123", 50000, 47500, 0), w, today)
    assert (a.days_left, a.runs_out, a.near) == (25.0, "2026-11-30", True)  # end not known: within 30 days
    a = weekly.pace(AccountUsage("abc123", 50000, 40000, 0), w, today, end="2026-12-31")
    assert (a.runs_out, a.near) == ("2027-02-13", False)  # lasts past the end
    a = weekly.pace(AccountUsage("abc123", 50000, 48000, 0), w, today, end="2026-12-31")
    assert (a.runs_out, a.near) == ("2026-11-25", True)  # runs out before the end
    a = weekly.pace(AccountUsage("idle", 1000, 10, 0), weekly.Weekly([0.0] * 12), today)
    assert (a.per_day, a.days_left, a.runs_out, a.near) == (0.0, None, "", False)  # nothing used lately
    a = weekly.pace(AccountUsage("pi_doe", 0, 48210, 9120, "FY27", 0.012), w, today)
    assert (a.per_day, a.days_left, a.near) == (100.0, None, False)  # no limit: billed, never runs out
    a = weekly.pace(AccountUsage("full", 100, 120, 0), None, today)
    assert (a.weeks, a.per_day, a.near) == (None, None, True)  # weeks not known, but used up


def test_allocations_ask_sacct_once_and_keep_it(monkeypatch):
    import subprocess
    calls = []

    class Ssh:
        def run(self, command, timeout=60, fast=None):
            calls.append(command)
            out = WEEKLY if "@RC" in command else "mygroup|18000000|11071200|76824000\nabc123|3000000|2766000|0\n"
            return subprocess.CompletedProcess(command, 0, out, "")
        on_login = run
        read = run

    monkeypatch.setattr(weekly, "_weekly_cache", {})
    got = weekly.allocations(Ssh(), "wulver")
    assert [(a.account, a.quota, a.used, a.weeks is not None) for a in got] == [
        ("mygroup", 300000, 184520, True), ("abc123", 50000, 46100, True)]
    assert "abc123,mygroup" in calls[1] and len(calls) == 2
    weekly.allocations(Ssh(), "wulver")
    assert len(calls) == 3  # the 12 weeks came from the cache
    weekly.allocations(Ssh(), "wulver", fresh=True)
    assert len(calls) == 5


def test_weekly_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", weekly.WEEKLY]).returncode == 0


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
        out = subprocess.run(["bash", "-c", weekly.WEEKLY, "_", "mygroup", paid], env=env,
                             capture_output=True, text=True).stdout
        return sorted(line for line in out.splitlines() if line.startswith("D|"))
    assert run("priority") == ["D|mygroup|2026-11-02|normal|4.00"]
    assert run("") == ["D|mygroup|2026-11-02|normal|20.00"]


def test_weekly_skips_lines_it_cannot_read():
    text = WEEKLY.replace("@JOBS\n", "@JOBS\nD|mygroup|2026-11-05|standard|lots\n").replace(
        "@QOS\n", "@QOS\nbroken\nodd|x\n")
    assert weekly.parse_weekly(text) == weekly.parse_weekly(WEEKLY)
    assert weekly.parse_weekly(WEEKLY.replace("@TODAY\n2026-11-05", "@TODAY\nsoon")) is None


def test_expanse_counts_su_seconds_so_the_app_divides():
    assert weekly.parse_weekly(WEEKLY, per_su=2) != weekly.parse_weekly(WEEKLY)
    one, half = weekly.parse_weekly(WEEKLY)["mygroup"], weekly.parse_weekly(WEEKLY, per_su=2)["mygroup"]
    assert sum(half.weeks) == sum(one.weeks) / 2
