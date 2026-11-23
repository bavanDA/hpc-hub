"""The clusters HPC Hub knows out of the box, one file each: its settings (cluster()) and what it does its own way
(SITE, see site.py). Adding a cluster: copy wulver.py, change it, and add it to ALL below. Nothing else names a
cluster, so that's all."""

from ..core.cluster_settings import ClusterConfig
from . import delta, sdsc, wulver, yale
from .site import Site

ALL = (wulver, yale, sdsc, delta)  # the order the first start offers them
_SITES = {m.cluster().id: m.SITE for m in ALL}


def default_clusters() -> list[ClusterConfig]:
    clusters = [m.cluster() for m in ALL]
    for c in clusters:
        c.ask_node = True  # new users see the node's size before each request, so they can change it
    return clusters


def site(cluster_id: str) -> Site:
    """The cluster's own ways; empty for an id that isn't one of these files."""
    return _SITES.get(cluster_id, Site())


def vpn_gateways() -> tuple[str, ...]:
    """The VPN gateways of the clusters built in (never ones from your settings), and the servers each hands you to:
    the VPN helper trusts these."""
    return tuple(h for c in default_clusters() if c.vpn.enabled and c.vpn.gateway
                 for h in (c.vpn.gateway, *site(c.id).vpn_servers))
