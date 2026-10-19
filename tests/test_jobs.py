from hpc_hub import jobs


def test_parse_jobs():
    text = ("101|hpc-hub|jdoe|devel|RUNNING|1:02|4:00:00|2|16G|r101u05\n"
            "99|train|jdoe|gpu|PENDING|0:00|1-00:00:00|8|64G|(Priority)\n"
            "98|old|jdoe|devel|CANCELLED by 1|0:10|4:00:00|2|16G|r1\n"
            "garbage line\n")
    got = jobs.parse_jobs(text)
    assert [j.job_id for j in got] == ["101", "99", "98"]
    assert got[0].from_app and not got[1].from_app
    assert got[1].where == "(Priority)" and got[2].state == "CANCELLED"


def test_job_su():
    text = ("7|vs|me|general|RUNNING|1:30:00|4:00:00|4|16G|n1|standard\n"
            "8|free|me|general|RUNNING|1:00:00|4:00:00|4|16G|n2|low\n"
            "9|wait|me|general|PENDING|0:00|1-00:00:00|8|32G|(Priority)|standard\n"
            f"{jobs.BILLING}\n7|cpu=4,mem=16G,node=1,billing=6|\n8|cpu=4,billing=4|\n"
            f"{jobs.QOS_LIST}\nlow|0.000000\nstandard|1.000000\n")
    a, b, c = jobs.parse_jobs(text)
    assert (a.qos, a.billing, a.su_spent, a.su_max) == ("standard", 6, 9.0, 24.0)
    assert b.factor == 0 and b.su_max == 0
    assert c.billing == 0 and c.su_max == 192.0  # no billing yet: count cores
    old = jobs.parse_jobs("5|x|me|p|COMPLETED|01:00:00|02:00:00|2|8G|n1|standard|billing=2,cpu=2\n")[0]
    assert (old.billing, old.su_spent) == (2, 2.0)


def test_seconds():
    assert [jobs.seconds(t) for t in ("1-02:03:04", "02:03:04", "03:04", "5", "1-02", "UNLIMITED")] == [
        93784, 7384, 184, 300, 93600, 0]


def test_jobs_command():
    assert '-u "$USER"' in jobs.jobs_command(jobs.MINE)
    assert "-u" not in jobs.jobs_command(jobs.ALL).split(";")[0]
    assert jobs.jobs_command(jobs.HISTORY, 3).startswith('sacct -n -P -X -u "$USER" -S now-3days')


def test_wait_gone(monkeypatch):
    import subprocess
    states = iter(["RUNNING", "COMPLETING", ""])

    class Ssh:
        def run(self, cmd, timeout=60):
            return subprocess.CompletedProcess(cmd, 0, next(states) + "\n", "")
    monkeypatch.setattr(jobs.time, "sleep", lambda _s: None)
    assert jobs.wait_gone(Ssh(), "42")

    class Stuck:
        def run(self, cmd, timeout=60):
            return subprocess.CompletedProcess(cmd, 0, "RUNNING\n", "")
    clock = iter(range(0, 100, 5))
    monkeypatch.setattr(jobs.time, "monotonic", lambda: next(clock))
    assert not jobs.wait_gone(Stuck(), "42", seconds=12)


def test_parse_details():
    text = ("JobId=1430555 JobName=hpc-hub-vscode\n   UserId=jdoe(12345) GroupId=jdoe(12345) MCS_label=N/A\n"
            "   JobState=RUNNING Reason=None Dependency=(null)\n   RunTime=00:07:39 TimeLimit=02:00:00 TimeMin=N/A\n"
            "   AllocNode:Sid=login02:3010257\n   AllocTRES=cpu=16,mem=64G,node=1,billing=16\n"
            "   StdOut=/home/x/out-1.out\n   StdErr=\n")
    d = jobs.parse_details(text)
    assert d["JobState"] == "RUNNING" and d["AllocTRES"] == "cpu=16,mem=64G,node=1,billing=16"
    assert d["UserId"] == "jdoe(12345)" and d["StdOut"] == "/home/x/out-1.out" and d["StdErr"] == ""
    assert d["AllocNode:Sid"] == "login02:3010257"
    assert jobs.parse_details("JobID|State\n5|COMPLETED\n") == {"JobID": "5", "State": "COMPLETED"}
