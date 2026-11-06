from hpc_hub.compute import job_log, salloc, sbatch, slurm, slurm_args
from hpc_hub.core.config import ComputeProfile


def test_salloc_command():
    p = ComputeProfile(cpus=4, mem_gb=16, time="04:00:00", partition="general",
                       account="pi_x", qos="standard", gpus=1, extra_args="--constraint='a b'")
    cmd = salloc.salloc_command(p)
    assert cmd.startswith("salloc --no-shell --job-name=hpc-hub --nodes=1 --ntasks=1 --cpus-per-task=4 --mem=16G")
    assert "--partition=general --account=pi_x --qos=standard --gres=gpu:1" in cmd
    assert cmd.endswith("'--constraint=a b'")


def test_validate():
    assert slurm_args.validate(ComputeProfile()) == []
    bad = ComputeProfile(cpus=0, time="soon", partition="x; rm -rf ~", extra_args="'")
    assert len(slurm_args.validate(bad)) == 4


def test_job_regex():
    m = salloc.JOB_RE.search("salloc: Granted job allocation 123456")
    assert m.group(1) == "Granted" and m.group(2) == "123456"
    assert salloc.JOB_RE.search("salloc: Pending job allocation 9").group(2) == "9"


def test_pick_reusable():
    J = slurm.Job
    jobs = [J("10", "hpc-hub", "n1", "devel"), J("12", "bash", "n2", "devel"), J("11", "claude", "n3", "devel")]
    assert slurm.pick_reusable(jobs, "devel").job_id == "11"
    assert slurm.pick_reusable(jobs[:2], "devel").job_id == "10"
    assert slurm.pick_reusable([], "devel") is None


def test_batch_script():
    p = ComputeProfile(cpus=16, mem_gb=64, time="12:00:00", partition="general", qos="standard", gpus=1)
    s = sbatch.batch_script(p, "hpc-hub-vscode", "code tunnel")
    lines = s.splitlines()
    assert lines[0] == "#!/bin/bash -l"
    for want in ("#SBATCH --job-name=hpc-hub-vscode", "#SBATCH --output=hpc-hub-vscode-%j.out",
                 "#SBATCH --cpus-per-task=16", "#SBATCH --mem=64G", "#SBATCH --time=12:00:00",
                 "#SBATCH --partition=general", "#SBATCH --qos=standard", "#SBATCH --gres=gpu:1"):
        assert want in lines
    assert lines[-1] == "code tunnel"


def test_follow_log_is_valid_shell():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", job_log.follow_log("123")]).returncode == 0


def test_tunnel_link(tmp_path):
    import subprocess
    log = tmp_path / "vs.out"
    log.write_text("x\n  Open:  https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe\nmore\n")

    class Ssh:
        def run(self, cmd, timeout=60):
            cmd = cmd.replace(job_log.log_path("7"), f"echo {log}")
            return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    assert job_log.tunnel_link(Ssh(), "7") == "https://vscode.dev/tunnel/n0018/mmfs1/home/jdoe"


def test_submit_a_script_from_its_folder(tmp_path, monkeypatch):
    import pytest

    from tests.helpers import LocalShell

    bin_dir, jobs = tmp_path / "bin", tmp_path / "home" / "proj"
    bin_dir.mkdir()
    jobs.mkdir(parents=True)
    (jobs / "run.sbatch").write_text("#!/bin/bash\n#SBATCH -t 1:00\n")
    fake = bin_dir / "sbatch"
    fake.write_text('#!/bin/bash\n[ -f "$2" ] || { echo "sbatch: no $2" >&2; exit 1; }\n'
                      'pwd > "$HOME/where"; echo "Submitted batch job 4242"\n')
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}:/usr/bin:/bin")
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    assert sbatch.submit_file(LocalShell(), "~/proj/run.sbatch") == "4242"
    assert (tmp_path / "home" / "where").read_text().strip() == str(jobs)
    with pytest.raises(slurm.SlurmError, match="no run2"):
        sbatch.submit_file(LocalShell(), "~/proj/run2.sbatch")
    with pytest.raises(slurm.SlurmError, match="Open a job script"):
        sbatch.submit_file(LocalShell(), " ")
