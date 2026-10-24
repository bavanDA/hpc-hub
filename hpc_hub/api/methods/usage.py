"""The Usage page: SU of your accounts and per person, storage quotas, and how busy the cluster is."""

from dataclasses import asdict

from ...compute import usage
from ..hub import hub
from ..server import method


@method("usage.accounts")
def accounts(cluster: str) -> list[dict]:
    """Your Slurm accounts with their SU totals (quota 0: no limit)."""
    return [asdict(a) for a in usage.account_usage(hub().connected(cluster).ssh)]


@method("usage.people")
def people(cluster: str, account: str, days: int = 30) -> dict:
    """SU charged per person in an account over the last days, busiest first; me marks you."""
    s = hub().connected(cluster)
    return {"people": [asdict(p) for p in usage.group_usage(s.ssh, account, int(days))], "me": s.ssh.username}


@method("usage.storage")
def storage(cluster: str, account: str = "") -> dict:
    """Quota rows (GB); raw is the plain text when the cluster's quota tool is one we can't read."""
    rows, raw = usage.storage(hub().connected(cluster).ssh, account)
    return {"rows": [asdict(r) for r in rows], "raw": raw}


@method("usage.load")
def load(cluster: str) -> list[dict]:
    """CPUs, GPUs, running and waiting jobs per partition."""
    return [asdict(p) for p in usage.load(hub().connected(cluster).ssh)]
