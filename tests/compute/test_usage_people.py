from hpc_hub.compute.usage import people


def test_group():
    text = ("@QOS\nlow|0.000000\nstandard|1.000000\n@JOBS\nme|standard|100.0\nme|low|40.0\nyou|low|5.0\n"
            "@NAMES\nme|Me Myself\nyou|You\nidle|Idle One\n")
    got = people.parse_group(text)
    assert [(p.user, p.name, p.charged, p.hours) for p in got] == [
        ("me", "Me Myself", 100.0, 140.0), ("you", "You", 0.0, 5.0), ("idle", "Idle One", 0.0, 0.0)]


def test_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", people.GROUP]).returncode == 0
