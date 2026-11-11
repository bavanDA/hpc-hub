from dataclasses import asdict

from ...compute.usage import accounts as su_accounts
from ...compute.usage import load as cluster_load
from ...compute.usage import people as su_people
from ...compute.usage import storage as quota
from ...compute.usage import weekly
from ..hub import hub
from ..server import method


@method("usage.accounts")
def accounts(cluster: str) -> list[dict]:
    """Your Slurm accounts with their SU totals (quota 0: no limit)."""
    return [asdict(a) for a in su_accounts.account_usage(hub().connected(cluster).ssh)]


@method("usage.allocations")
def allocations(cluster: str, fresh: bool = False) -> dict:
    """Every group you can bill, with its SUs per week for the last 12 weeks (None: the cluster could not tell),
    the pace of the last 4 weeks and when it runs out at that pace. me: your user name."""
    s = hub().connected(cluster)
    groups = weekly.allocations(s.ssh, cluster, bool(fresh), s.cfg.paid_partitions, s.cfg.billing_per_su)
    return {"groups": [asdict(a) for a in groups], "me": s.ssh.username}


@method("usage.people")
def people(cluster: str, account: str, days: int = 30) -> dict:
    """SU charged per person in an account over the last days, busiest first."""
    s = hub().connected(cluster)
    found = su_people.group_usage(s.ssh, account, int(days), s.cfg.billing_per_su)
    return {"people": [asdict(p) for p in found], "me": s.ssh.username}


@method("usage.storage")
def storage(cluster: str, account: str = "") -> dict:
    """Quota rows (GB); raw is the plain text when the cluster's quota tool is one we can't read."""
    rows, raw = quota.storage(hub().connected(cluster).ssh, account)
    return {"rows": [asdict(r) for r in rows], "raw": raw}


@method("usage.load")
def load(cluster: str) -> list[dict]:
    """CPUs, GPUs, running and waiting jobs per partition."""
    return [asdict(p) for p in cluster_load.load(hub().connected(cluster).ssh)]
