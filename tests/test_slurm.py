from hpc_hub import slurm
from hpc_hub.config import ComputeProfile


def test_salloc_command():
    p = ComputeProfile(cpus=4, mem_gb=16, time="04:00:00", partition="general",
                       account="pi_x", qos="standard", gpus=1, extra_args="--constraint='a b'")
    cmd = slurm.salloc_command(p)
    assert cmd.startswith("salloc --no-shell --job-name=hpc-hub --cpus-per-task=4 --mem=16G")
    assert "--partition=general --account=pi_x --qos=standard --gres=gpu:1" in cmd
    assert cmd.endswith("'--constraint=a b'")


def test_validate():
    assert slurm.validate(ComputeProfile()) == []
    bad = ComputeProfile(cpus=0, time="soon", partition="x; rm -rf ~", extra_args="'")
    assert len(slurm.validate(bad)) == 4


def test_job_regex():
    m = slurm.JOB_RE.search("salloc: Granted job allocation 123456")
    assert m.group(1) == "Granted" and m.group(2) == "123456"
    assert slurm.JOB_RE.search("salloc: Pending job allocation 9").group(2) == "9"


def test_pick_reusable():
    J = slurm.Job
    jobs = [J("10", "hpc-hub", "n1", "devel"), J("12", "bash", "n2", "devel"), J("11", "claude", "n3", "devel")]
    assert slurm.pick_reusable(jobs, "devel").job_id == "11"
    assert slurm.pick_reusable(jobs[:2], "devel").job_id == "10"
    assert slurm.pick_reusable([], "devel") is None


def test_parse_jobs():
    text = ("101|hpc-hub|jdoe|devel|RUNNING|1:02|4:00:00|2|16G|r101u05\n"
            "99|train|jdoe|gpu|PENDING|0:00|1-00:00:00|8|64G|(Priority)\n"
            "98|old|jdoe|devel|CANCELLED by 1|0:10|4:00:00|2|16G|r1\n"
            "garbage line\n")
    jobs = slurm.parse_jobs(text)
    assert [j.job_id for j in jobs] == ["101", "99", "98"]
    assert jobs[0].from_app and not jobs[1].from_app
    assert jobs[1].where == "(Priority)" and jobs[2].state == "CANCELLED"


def test_job_su():
    text = ("7|vs|me|general|RUNNING|1:30:00|4:00:00|4|16G|n1|standard\n"
            "8|free|me|general|RUNNING|1:00:00|4:00:00|4|16G|n2|low\n"
            "9|wait|me|general|PENDING|0:00|1-00:00:00|8|32G|(Priority)|standard\n"
            f"{slurm.BILLING}\n7|cpu=4,mem=16G,node=1,billing=6|\n8|cpu=4,billing=4|\n"
            f"{slurm.QOS_LIST}\nlow|0.000000\nstandard|1.000000\n")
    a, b, c = slurm.parse_jobs(text)
    assert (a.qos, a.billing, a.su_spent, a.su_max) == ("standard", 6, 9.0, 24.0)
    assert b.factor == 0 and b.su_max == 0
    assert c.billing == 0 and c.su_max == 192.0  # no billing yet: count cores
    old = slurm.parse_jobs("5|x|me|p|COMPLETED|01:00:00|02:00:00|2|8G|n1|standard|billing=2,cpu=2\n")[0]
    assert (old.billing, old.su_spent) == (2, 2.0)


def test_seconds():
    assert [slurm.seconds(t) for t in ("1-02:03:04", "02:03:04", "03:04", "5", "1-02", "UNLIMITED")] == [
        93784, 7384, 184, 300, 93600, 0]


def test_parse_usage():
    got = slurm.parse_usage("mygroup|181080000|16076854|962138433\nnew|1500||\njunk\n")
    assert [(u.account, u.quota, u.used, u.mine) for u in got] == [
        ("mygroup", 3018000, 267947, 267260), ("new", 25, 0, 0)]


def test_jobs_command():
    assert '-u "$USER"' in slurm.jobs_command(slurm.MINE)
    assert "-u" not in slurm.jobs_command(slurm.ALL).split(";")[0]
    assert slurm.jobs_command(slurm.HISTORY, 3).startswith('sacct -n -P -X -u "$USER" -S now-3days')


def test_batch_script():
    p = ComputeProfile(cpus=16, mem_gb=64, time="12:00:00", partition="general", qos="standard", gpus=1)
    s = slurm.batch_script(p, "hpc-hub-vscode", "code tunnel")
    lines = s.splitlines()
    assert lines[0] == "#!/bin/bash -l"
    for want in ("#SBATCH --job-name=hpc-hub-vscode", "#SBATCH --output=hpc-hub-vscode-%j.out",
                 "#SBATCH --cpus-per-task=16", "#SBATCH --mem=64G", "#SBATCH --time=12:00:00",
                 "#SBATCH --partition=general", "#SBATCH --qos=standard", "#SBATCH --gres=gpu:1"):
        assert want in lines
    assert lines[-1] == "code tunnel"


def test_follow_log_is_valid_shell():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", slurm.follow_log("123")]).returncode == 0


def test_wait_gone(monkeypatch):
    import subprocess
    states = iter(["RUNNING", "COMPLETING", ""])

    class Ssh:
        def run(self, cmd, timeout=60):
            return subprocess.CompletedProcess(cmd, 0, next(states) + "\n", "")
    monkeypatch.setattr(slurm.time, "sleep", lambda _s: None)
    assert slurm.wait_gone(Ssh(), "42")

    class Stuck:
        def run(self, cmd, timeout=60):
            return subprocess.CompletedProcess(cmd, 0, "RUNNING\n", "")
    clock = iter(range(0, 100, 5))
    monkeypatch.setattr(slurm.time, "monotonic", lambda: next(clock))
    assert not slurm.wait_gone(Stuck(), "42", seconds=12)


def test_tunnel_link(tmp_path):
    import subprocess
    log = tmp_path / "vs.out"
    log.write_text("x\n  Open:  https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe\nmore\n")

    class Ssh:
        def run(self, cmd, timeout=60):
            cmd = cmd.replace(slurm.log_path("7"), f"echo {log}")
            return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    assert slurm.tunnel_link(Ssh(), "7") == "https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe"


def test_parse_details():
    text = ("JobId=1430555 JobName=hpc-hub-vscode\n   UserId=jdoe(12345) GroupId=jdoe(12345) MCS_label=N/A\n"
            "   JobState=RUNNING Reason=None Dependency=(null)\n   RunTime=00:07:39 TimeLimit=02:00:00 TimeMin=N/A\n"
            "   AllocNode:Sid=login02:3010257\n   AllocTRES=cpu=16,mem=64G,node=1,billing=16\n"
            "   StdOut=/home/x/out-1.out\n   StdErr=\n")
    d = slurm.parse_details(text)
    assert d["JobState"] == "RUNNING" and d["AllocTRES"] == "cpu=16,mem=64G,node=1,billing=16"
    assert d["UserId"] == "jdoe(12345)" and d["StdOut"] == "/home/x/out-1.out" and d["StdErr"] == ""
    assert d["AllocNode:Sid"] == "login02:3010257"
    assert slurm.parse_details("JobID|State\n5|COMPLETED\n") == {"JobID": "5", "State": "COMPLETED"}


def test_hours_time():
    assert [slurm.hours_time(h) for h in (1, 5, 24, 30, 72)] == [
        "01:00:00", "05:00:00", "1-00:00:00", "1-06:00:00", "3-00:00:00"]
    assert all(slurm.TIME.match(slurm.hours_time(h)) for h in (1, 30))
