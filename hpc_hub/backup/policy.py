"""Each cluster's scratch purge rule, from its docs (November 2026) and what the cluster says at run time.
Where the docs don't say which date counts, the oldest one does: an early warning is cheap."""

import re
from dataclasses import replace

from .model import Purge

POLICIES = {
    "wulver": Purge(
        days=30, basis="oldest", sooner_when_full_pct=80, warns_by_email=True,
        source_url="https://hpc.njit.edu/clusters/Wulver_filesystems/",
        quote="Files are deleted from /scratch after they are 30 days old."),
    "yale": Purge(  # the docs say 30 in two places and 60 in one; getquota's Purged column decides at run time
        days=30, basis="oldest", warns_by_email=True,
        source_url="https://docs.ycrc.yale.edu/clusters/bouchet/",
        quote="Files stored in scratch are purged if they are older than 30 days."),
    "sdsc": Purge(
        days=90, basis="created",
        source_url="https://www.sdsc.edu/systems/expanse/user_guide.html",
        quote="Scratch files will be purged 90 days from creation date."),
}

# Wulver forbids changing dates to dodge the timer; Yale forbids it without their OK. HPC Hub never does.
NO_TRICKS = "HPC Hub never touches files to keep them longer. Clusters do not allow that."

PURGED = re.compile(r"^\s*scratch\b.*?\b(\d+)\s+days?\s*$", re.I | re.M)


def parse_purged(getquota: str) -> int:
    """The scratch row's Purged column ("30 days") from Yale's getquota, or 0."""
    m = PURGED.search(getquota or "")
    return int(m.group(1)) if m else 0


def resolve(cluster_id: str, getquota: str = "") -> Purge:
    """The rule for this cluster; days: 0 for a cluster we know nothing about (no timer: no deadlines)."""
    base = POLICIES.get(cluster_id)
    days = parse_purged(getquota)
    if base is None:
        return Purge(days=days, basis="oldest", from_cluster=bool(days))
    return replace(base, days=days, from_cluster=True) if days else replace(base)
