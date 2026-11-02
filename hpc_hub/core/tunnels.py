"""Clusters reached through a local port instead of directly: the phone's VPN (connect/vpn_android.py) forwards
127.0.0.1:<port> to the cluster's SSH port. SSH dials that port and still checks the cluster's own host key, under
its own name."""

import threading

_lock = threading.Lock()
_ports: dict[tuple[str, int], int] = {}


def use(host: str, port: int, local: int) -> None:
    with _lock:
        _ports[(host.lower(), port)] = local


def drop(host: str, port: int) -> None:
    with _lock:
        _ports.pop((host.lower(), port), None)


def local_port(host: str, port: int) -> int | None:
    """The local port that leads to host:port, or None to connect directly."""
    with _lock:
        return _ports.get((host.lower(), port))
