"""A cluster's scratch purge rule: from its docs (each cluster's file in hpc_hub/clusters, as of November 2026) and
what the cluster says at run time. Where the docs don't say which date counts, the oldest one does: an early warning
is cheap."""

import re
from dataclasses import replace

from .. import clusters
from .model import Purge

# Wulver forbids changing dates to dodge the timer; Yale forbids it without their OK. HPC Hub never does.
NO_TRICKS = "HPC Hub never touches files to keep them longer. Clusters do not allow that."

PURGED = re.compile(r"^\s*scratch\b.*?\b(\d+)\s+days?\s*$", re.I | re.M)


def parse_purged(getquota: str) -> int:
    """The scratch row's Purged column ("30 days") from Yale's getquota, or 0."""
    m = PURGED.search(getquota or "")
    return int(m.group(1)) if m else 0


def resolve(cluster_id: str, getquota: str = "") -> Purge:
    """The rule for this cluster; days: 0 for a cluster we know nothing about (no timer: no deadlines)."""
    base = clusters.site(cluster_id).purge
    days = parse_purged(getquota)
    if base is None:
        return Purge(days=days, basis="oldest", from_cluster=bool(days))
    return replace(base, days=days, from_cluster=True) if days else replace(base)
