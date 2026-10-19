from hpc_hub import usage


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
    assert (g.name, g.cpus_used, g.cpus_total, g.pending, g.running, g.gpus_total) == ("general", 11682, 12416, 102, 211, 0)
    assert (gpu.gpus_used, gpu.gpus_total, gpu.pending) == (1, 12, 0)
