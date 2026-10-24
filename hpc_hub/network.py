"""Network probes: can we reach a host, over which interface and network, does the SSH link work."""

import socket
import subprocess

from .core.ssh import SshMaster


def reachable(host: str, port: int, timeout: float = 3.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def route_device(host: str) -> str:
    """Network interface the laptop uses to reach host (vpn0, wlp3s0…), or ""."""
    try:
        ip = socket.gethostbyname(host)
        out = subprocess.run(["ip", "route", "get", ip], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    words = out.split()
    return words[words.index("dev") + 1] if "dev" in words[:-1] else ""


def network_name(dev: str) -> str:
    """NetworkManager connection on that interface, e.g. NJITsecure."""
    try:
        out = subprocess.run(["nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show", "--active"],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    for line in out.splitlines():
        name, _, device = line.rpartition(":")
        if dev and device == dev:
            return name.replace("\\:", ":")
    return ""


def link_works(ssh: SshMaster) -> bool:
    """The login is alive and a command really gets through (not just a stale socket)."""
    try:
        return ssh.alive() and ssh.run("true", timeout=15).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False
