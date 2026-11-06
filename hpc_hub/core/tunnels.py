"""Clusters reached through a local port (the phone's VPN). SSH dials the port but checks the cluster's own host
key."""

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
