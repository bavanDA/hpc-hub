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


def test_tunnel_link(tmp_path):
    import subprocess
    log = tmp_path / "vs.out"
    log.write_text("x\n  Open:  https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe\nmore\n")

    class Ssh:
        def run(self, cmd, timeout=60):
            cmd = cmd.replace(slurm.log_path("7"), f"echo {log}")
            return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    assert slurm.tunnel_link(Ssh(), "7") == "https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe"
def test_hours_time():
    assert [slurm.hours_time(h) for h in (1, 5, 24, 30, 72)] == [
        "01:00:00", "05:00:00", "1-00:00:00", "1-06:00:00", "3-00:00:00"]
    assert all(slurm.TIME.match(slurm.hours_time(h)) for h in (1, 30))
