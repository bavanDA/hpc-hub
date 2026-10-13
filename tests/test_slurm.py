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
