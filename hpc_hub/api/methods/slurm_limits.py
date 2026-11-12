"""What Slurm allows on a cluster, read at the last login: partitions, QoS, accounts, sizes, GPUs and billing."""

from dataclasses import asdict

from ...compute import gpus as gpu_list
from ...compute import guide, limits, maintenance
from ..hub import hub
from ..server import method

UNKNOWN = {"known": False, "partitions": [], "default_partition": "", "qos": [], "default_qos": "", "accounts": [],
           "default_account": "", "longest": None, "why": "", "cores": None, "memory_gb": None,
           "mem_per_core_gb": None, "gpu_caps": {}, "billing": None}


def _billing(cfg, billing: dict | None, partition: str) -> dict | None:
    """A partition the cluster doesn't bill (Yale's public ones) costs nothing, whatever the QoS says."""
    if billing and not cfg.paid(partition):
        billing = {**billing, "factor": 0, "free": "partition"}
    return billing and {**billing, "per_su": cfg.billing_per_su}


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
    account = account.strip() or lim.default_account
    choices = lim.qos_choices(partition, account)
    refused = lim.refused_qos(partition, qos, account)
    part = partition or lim.default_partition
    cores, memory_gb = lim.biggest(part, qos)
    per_core = lim.mem_per_core_mb.get(part)
    # only your queues: not other groups' (Wulver's course queues are for the courses group)
    return {"known": True, "partitions": [p for p in lim.partitions if lim.yours(p)],
            "default_partition": lim.default_partition,
            "qos": choices or lim.account_qos.get(account) or lim.allowed_qos,
            # the priority asked for (or your default) waits forever here: say so, and which one to use instead
            "qos_refused": refused, "qos_fix": choices[0] if refused and choices else "",
            "qos_note": _only(part, choices, lim.account_qos.get(account) or lim.allowed_qos),
            "needs_gpu": lim.needs_gpu(part),  # a GPU-only queue: the window adds a GPU
            "default_qos": lim.default_qos, "accounts": list(lim.account_qos), "default_account": lim.default_account,
            "longest": longest, "why": why, "cores": cores, "memory_gb": memory_gb,
            "mem_per_core_gb": round(per_core / 1024, 2) if per_core else None, "gpu_caps": lim.gpu_caps(qos),
            "billing": _billing(s.cfg, lim.billing_for(part, qos), part)}


def _only(partition: str, choices: list[str], yours: list[str]) -> str:
    """A partition that takes only some of your priorities says which, so the window can show why it switched."""
    if not choices or set(choices) == set(yours):
        return ""
    return f"The {partition} queue takes priority {' or '.join(choices)} only."


@method("clusters.limits")
def guide_for(cluster: str) -> dict:
    """What each queue lets one job ask for, read from Slurm now (see guide.guide), with what an hour costs on it.
    Also keeps what it read for the job dialogs. known is false when Slurm answered nothing."""
    s = hub().connected(cluster)
    got = limits.fetch(s.ssh, s.cfg.id)
    if not got.partitions:
        return {"known": False, "queues": [], "qos": [], "others": 0}
    s.limits = got
    out = guide.guide(got)
    for q in out["queues"]:
        q["billing"] = _billing(s.cfg, got.billing_for(q["name"]), q["name"])
    return {"known": True, **out}


@method("clusters.maintenance")
def next_maintenance(cluster: str) -> dict | None:
    """The cluster-wide maintenance Slurm has booked next, read now. None: nothing booked."""
    found = maintenance.next_maintenance(hub().connected(cluster).ssh)
    return asdict(found) if found else None


@method("clusters.gpus")
def gpus(cluster: str) -> dict:
    """The GPU types this cluster offers, from Slurm (known false: the docs' list)."""
    s = hub().session(cluster)
    lim = s.limits
    if lim and lim.gres:
        return {"known": True, "gpus": gpu_list.as_json(gpu_list.options(lim.gres, s.cfg.id))}
    return {"known": False, "gpus": gpu_list.as_json(gpu_list.from_docs(s.cfg.id))}
