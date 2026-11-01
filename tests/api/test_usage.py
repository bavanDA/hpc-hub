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


class FakeHub:
    def __init__(self, connected=True):
        self.ok = connected
        self.s = SimpleNamespace(ssh=FakeSsh())

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
