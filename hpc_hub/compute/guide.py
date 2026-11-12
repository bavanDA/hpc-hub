"""What each queue lets one job ask for, in one list: the numbers behind the Limits tab, worked out from Limits."""

from .limits import Limits, minutes


def _number(rules: dict[str, str], key: str) -> int | None:
    return int(rules[key]) if rules.get(key, "").isdigit() else None


def _smallest(*limits: int | None) -> int | None:
    known = [x for x in limits if x is not None]
    return min(known) if known else None


def _most(limits: list[int | None]) -> int | None:
    """The biggest of what each QoS allows; None (no limit, or not known) wins."""
    return None if not limits or None in limits else max(limits)


def _gpus(lim: Limits, name: str, qos: list[str]) -> list[dict]:
    """Each GPU type here and the most of it one node can give a job."""
    per_node: dict[str, int] = {}
    for gres in lim.gres.get(name, []):  # "gpu:a100:4" or "gpu:4"
        bits = gres.split(":")
        if bits[-1].isdigit():
            kind = bits[1] if len(bits) == 3 else ""
            per_node[kind] = max(int(bits[-1]), per_node.get(kind, 0))
    out = []
    for kind, count in per_node.items():
        most = max(_smallest(count, lim.caps(name, q).get("gpu"), lim.caps(name, q).get(f"gpu:{kind}")) for q in qos)
        if most:
            out.append({"type": kind, "count": most, "per_node": count})
    return out


def _queue(lim: Limits, name: str) -> dict:
    rules = lim.rules.get(name, {})
    qos = lim.usable_qos(name) or [""]
    total = _number(rules, "TotalNodes")
    node_cores, node_mem = lim.cores.get(name), lim.memory_gb.get(name)
    nodes = [_smallest(_number(rules, "MaxNodes"), total, lim.caps(name, q).get("node")) for q in qos]
    cores = [_smallest(node_cores * n if node_cores and n else node_cores, lim.caps(name, q).get("cpu"))
             for q, n in zip(qos, nodes)]
    mem = [_smallest(node_mem, lim.caps(name, q).get("mem")) for q in qos]
    default_core = _number(rules, "DefMemPerCPU")
    per_core = lim.mem_per_core_mb.get(name)
    times = [t for t in (lim.longest(name, q)[0] for q in qos) if t]  # a QoS with no limit of its own says nothing
    return {
        "name": name, "default": name == lim.default_partition, "up": rules.get("State", "UP") == "UP", "nodes": total,
        "longest": max(times) if times else None, "default_time": minutes(rules.get("DefaultTime", "")),
        "max_nodes": _most(nodes), "cores": _most(cores), "cores_per_node": node_cores, "memory_gb": _most(mem),
        "mem_per_core_gb": round(per_core / 1024, 1) if per_core else None,
        "default_mem_per_core_gb": round(default_core / 1024, 1) if default_core else None,
        "gpus": _gpus(lim, name, qos),
        "whole_nodes": rules.get("OverSubscribe", "").startswith("EXCLUSIVE"),
        "can_be_stopped": rules.get("PreemptMode", "OFF") != "OFF",
    }


def guide(lim: Limits) -> dict:
    """The queues you can use, default first, with what one job may ask for on each; the priorities (QoS) you may use
    on them; and how many other queues exist that your groups can't use. None: no limit, or Slurm doesn't say."""
    yours = sorted((p for p in lim.partitions if lim.yours(p)), key=lambda p: p != lim.default_partition)
    used = {q for p in yours for q in lim.usable_qos(p)}
    return {
        "queues": [_queue(lim, p) for p in yours],
        "qos": [{"name": q, "longest": lim.qos.get(q), "per_job": lim.qos_per_job.get(q, {}),
                 "per_user": lim.qos_per_user.get(q, {}), "factor": lim.usage_factor.get(q, 1.0),
                 "queues": [p for p in yours if q in lim.usable_qos(p)]} for q in lim.allowed_qos if q in used],
        "others": len(lim.partitions) - len(yours),
    }
