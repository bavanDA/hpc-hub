from hpc_hub.api.methods import slurm_limits
from hpc_hub.core import config

YALE = next(c for c in config.default_clusters() if c.id == "yale")
WULVER = next(c for c in config.default_clusters() if c.id == "wulver")
BILLING = {"weights": {"cpu": 1.0}, "max": "", "factor": 1.0}


def test_yale_bills_only_its_priority_partitions():
    assert YALE.paid("priority_gpu") and not YALE.paid("day") and not YALE.paid("gpu")
    assert slurm_limits._billing(YALE, BILLING, "day") == {**BILLING, "factor": 0, "free": "partition", "per_su": 1}
    assert slurm_limits._billing(YALE, BILLING, "priority") == {**BILLING, "per_su": 1}


def test_elsewhere_every_partition_is_billed():
    assert WULVER.paid("general") and slurm_limits._billing(WULVER, BILLING, "gpu") == {**BILLING, "per_su": 1}
    assert slurm_limits._billing(YALE, None, "day") is None


def test_expanse_says_how_many_billing_units_make_an_su():
    sdsc = next(c for c in config.default_clusters() if c.id == "sdsc")
    assert slurm_limits._billing(sdsc, BILLING, "shared")["per_su"] == 3600
