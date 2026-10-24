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
