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


def test_jobs_command():
    assert '-u "$USER"' in slurm.jobs_command(slurm.MINE)
    assert "-u" not in slurm.jobs_command(slurm.ALL)
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
