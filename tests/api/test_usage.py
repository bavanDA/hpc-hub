import subprocess
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import usage as m

GROUP = "@QOS\nlow|0.000000\nstandard|1.000000\n@JOBS\njdoe|standard|100.0\njdoe|low|40.0\n@NAMES\njdoe|Jane Doe\n"
STORAGE = ("@QUOTA\nUsage for account: mygroup\n   PROJECT Storage: 1463 GB (of 2048 GB quota)\n"
           "     User jdoe Usage: 31 GB (No quota)\n@USERS\n")
LOAD = "@PART\ngeneral*|up|97|11682/734/0/12416\n@GPU\n@PEND\n    102 general\n@RUN\n    211 general\n"
YALE = ('@USER jdoe\n@ACCOUNT mygroup\n'
        '{"fy": "FY27", "bill_rate": 0.01, "rows": [{"username": "jdoe", "su_hours": 40}]}\n')


class FakeSsh:
    username = "jdoe"

    def run(self, command, timeout=60, fast=None):
        out = (YALE if "getusage" in command else GROUP if "@JOBS" in command else STORAGE if "@QUOTA" in command
               else LOAD if "@PART" in command else "")
        return subprocess.CompletedProcess(command, 0, out, "")
    on_login = run
    read = run


class FakeHub:
    def __init__(self, connected=True):
        self.ok = connected
        self.s = SimpleNamespace(ssh=FakeSsh(), cfg=SimpleNamespace(paid_partitions="priority", billing_per_su=1))

    def connected(self, cluster):
        if not self.ok:
            raise RuntimeError("Connect to Yale first")
        return self.s


@pytest.fixture
def fake(monkeypatch):
    h = FakeHub()
    monkeypatch.setattr(hub_mod, "_hub", h)
    return h


def test_accounts(fake):
    assert m.accounts("yale") == [
        {"account": "mygroup", "quota": 0, "used": 40, "mine": 40, "period": "FY27", "rate": 0.01}]
    fake.ok = False
    with pytest.raises(RuntimeError, match="Connect to Yale first"):
        m.accounts("yale")


def test_people_storage_load(fake):
    got = m.people("wulver", "mygroup", 30)
    assert got["me"] == "jdoe" and got["people"] == [{"user": "jdoe", "name": "Jane Doe", "charged": 100.0,
                                                      "hours": 140.0}]
    rows = m.storage("wulver", "mygroup")
    assert rows["raw"] == "" and rows["rows"][0] == {"label": "mygroup project", "used": 1463, "quota": 2048,
                                                     "mine": 31, "people": {}, "files": 0, "file_limit": 0,
                                                     "backup": "", "purged": 0}
    part = m.load("wulver")[0]
    assert (part["name"], part["cpus_used"], part["running"], part["pending"]) == ("general", 11682, 211, 102)


def test_allocations(fake, monkeypatch):
    from hpc_hub.compute.usage import weekly
    monkeypatch.setattr(weekly, "_weekly_cache", {})
    asked = []
    monkeypatch.setattr(weekly, "weekly", lambda ssh, cluster, accounts, fresh=False, paid="", per_su=1:
                        asked.append(paid) or {
        "mygroup": weekly.Weekly([0.0] * 8 + [70.0] * 4, {"jdoe": 280.0})})
    got = m.allocations("yale")
    assert got["me"] == "jdoe"
    g = got["groups"][0]
    assert (g["account"], g["used"], g["rate"], g["per_day"], g["days_left"], g["people"]) == (
        "mygroup", 40, 0.01, 10.0, None, {"jdoe": 280.0})
    assert g["weeks"][-1] == 70.0 and len(g["weeks"]) == 12
    assert asked == ["priority"]  # Yale's public partitions are free: only priority jobs count
