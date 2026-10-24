import subprocess

from hpc_hub.connect import network


def test_route_device(monkeypatch):
    monkeypatch.setattr(network.socket, "gethostbyname", lambda h: "128.235.212.9")
    monkeypatch.setattr(network.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(
        a, 0, "128.235.212.9 dev vpn1 src 10.192.144.79 uid 1000 \n    cache \n", ""))
    assert network.route_device("wulver.njit.edu") == "vpn1"
