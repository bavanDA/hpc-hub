"""The monitoring bar under a terminal: CPU, memory, network, uptime, users and disks of the host it runs on."""

import itertools
import threading
from collections.abc import Callable

from ...terminals import monitor
from ..hub import hub
from ..server import method

_ids = itertools.count(1)
_watches: dict[int, Callable[[], None]] = {}
_lock = threading.Lock()


@method("monitor.watch")
def watch(cluster: str, node: str = "") -> int:
    """Start watching the login node, or node. Stats come every few seconds as `monitor` events {id, host, cpu,
    mem_used, mem_total, up, down, uptime, users, disks, nets} until monitor.unwatch. Returns the id."""
    h = hub()
    ssh = h.connected(cluster).ssh
    with _lock:
        wid = next(_ids)
        _watches[wid] = monitor.watch(ssh, node, lambda stats: h.emit("monitor", {"id": wid, **stats}))
    return wid


@method("monitor.unwatch")
def unwatch(id: int) -> None:
    with _lock:
        stop = _watches.pop(id, None)
    if stop:
        stop()
