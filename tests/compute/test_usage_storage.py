from hpc_hub.compute.usage import storage


def test_storage():
    text = ("@QUOTA\nUsage for account: mygroup\n   SLURM Service Units: 1 CPU Hours (of 2 CPU Hour quota)\n"
            "   PROJECT Storage: 1463 GB (of 2048 GB quota)\n     User me Usage: 31 GB (No quota)\n"
            "   SCRATCH Storage: 7574 GB (of 10240 GB quota) \n     User me Usage: 7502 GB (No quota)\n"
            "HOME Storage me Usage: 46 GB (of 50 GB quota)\n"
            "@USERS\nyou|sata1-project_mygroup|2097152\nme|nvme1-scratch_mygroup|1048576\nzero|sata1-project_mygroup|0\n")
    rows, raw = storage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [
        ("mygroup project", 1463, 2048, 31), ("mygroup scratch", 7574, 10240, 7502), ("Home", 46, 50, 46)]
    assert rows[0].people == {"you": 2.0} and rows[1].people == {"me": 1.0} and raw == ""
    assert storage.parse_storage("@QUOTA\nFilesystem Size\n/home 1G\n@USERS\n") == ([], "Filesystem Size\n/home 1G")


def test_yale_getquota():
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
    rows, raw = storage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [
        ("pi_abc project", 3126, 4096, 1371), ("pi_abc scratch", 7831, 10240, 2735), ("Home", 10, 125, 10)]
    assert raw == ""


def test_expanse_lustre_storage():
    text = ("@QUOTA\nUsage for account: abc123\n   PROJECTS + SCRATCH Storage: 336 GB (of 51200 GB quota)\n"
            "     User jdoe Usage: 120 GB\n@USERS\n")
    rows, raw = storage.parse_storage(text)
    assert [(r.label, r.used, r.quota, r.mine) for r in rows] == [("abc123 projects + scratch", 336, 51200, 120)]
    assert raw == ""


def test_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", storage.STORAGE]).returncode == 0
