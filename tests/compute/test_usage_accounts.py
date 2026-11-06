from hpc_hub.compute.usage import accounts


def test_parse_usage():
    got = accounts.parse_usage("mygroup|181080000|16076854|962138433\nnew|1500||\njunk\n")
    assert [(u.account, u.quota, u.used, u.mine) for u in got] == [
        ("mygroup", 3018000, 267947, 267260), ("new", 25, 0, 0)]


def test_yale_getusage():
    import json
    rows = [{"su_hours": 100.4, "username": "jdoe"}, {"su_hours": 50.0, "username": "other"},
            {"su_hours": 10.0, "username": "jdoe"}]
    text = (f"@USER jdoe\n@ACCOUNT pi_abc\n{json.dumps({'fy': 'FY27', 'bill_rate': 0.0049, 'rows': rows}, indent=2)}\n"
            "@ACCOUNT broken\nnot json\n")
    assert accounts.parse_usage(text) == [accounts.AccountUsage("pi_abc", 0, 160, 110, "FY27", 0.0049)]


def test_expanse_su():
    assert accounts.parse_usage("abc123|SU|200000|11118|500\n") == [accounts.AccountUsage("abc123", 200000, 11118, 500)]


def test_clusters_without_limits_show_every_account():
    no_limits = accounts.parse_usage("pi_abc||3944920|34787225\nprio_abc||600|3600\n")
    assert [(a.account, a.quota) for a in no_limits] == [("pi_abc", 0), ("prio_abc", 0)]
    assert [a.account for a in accounts.parse_usage("a|60|0|0\nb||60|0\n")] == ["a"]  # limits known: those only


def test_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", accounts.USAGE]).returncode == 0
    assert "exit" not in accounts.USAGE  # runs in the long-lived shell
