"""What Slurm allows on a cluster, read at the last login: partitions, QoS, accounts, sizes, GPUs and billing."""

from ...compute import gpus as gpu_list
from ..hub import hub
from ..server import method

UNKNOWN = {"known": False, "partitions": [], "default_partition": "", "qos": [], "default_qos": "", "accounts": [],
           "default_account": "", "longest": None, "why": "", "cores": None, "memory_gb": None,
           "mem_per_core_gb": None, "gpu_caps": {}, "billing": None}


def _billing(cfg, billing: dict | None, partition: str) -> dict | None:
    """A partition the cluster doesn't bill (Yale's public ones) costs nothing, whatever the QoS says."""
    if billing and not cfg.paid(partition):
        return {**billing, "factor": 0, "free": "partition"}
    return billing


@method("clusters.partitions")
def partitions(cluster: str, partition: str = "", qos: str = "", account: str = "") -> dict:
    """The choices for a job on this partition and QoS: longest time (minutes), cores and GB per job, memory per
    core, GPU caps ({"l40": 0}: not with this QoS) and the cost of an hour (None: no weights). known is false until
    you connected once."""
    s = hub().session(cluster)
    lim = s.limits
    if not lim:
        return dict(UNKNOWN)
    partition, qos = partition.strip(), qos.strip()
    longest, why = lim.longest(partition, qos)
    part = partition or lim.default_partition
    cores, memory_gb = lim.biggest(part, qos)
    per_core = lim.mem_per_core_mb.get(part)
    return {"known": True, "partitions": list(lim.partitions), "default_partition": lim.default_partition,
            "qos": lim.account_qos.get(account.strip() or lim.default_account) or lim.allowed_qos,
            "default_qos": lim.default_qos, "accounts": list(lim.account_qos), "default_account": lim.default_account,
            "longest": longest, "why": why, "cores": cores, "memory_gb": memory_gb,
            "mem_per_core_gb": round(per_core / 1024, 2) if per_core else None, "gpu_caps": lim.gpu_caps(qos),
            "billing": _billing(s.cfg, lim.billing_for(part, qos), part)}


@method("clusters.gpus")
def gpus(cluster: str) -> dict:
    """The GPU types this cluster offers, from Slurm (known false: the docs' list)."""
    s = hub().session(cluster)
    lim = s.limits
    if lim and lim.gres:
        return {"known": True, "gpus": gpu_list.as_json(gpu_list.options(lim.gres, s.cfg.id))}
    return {"known": False, "gpus": gpu_list.as_json(gpu_list.from_docs(s.cfg.id))}
