import shlex
import sys
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.terminals import monitor

posix = pytest.mark.skipif(sys.platform == "win32", reason="posix: a local sh stands in for the cluster")

NET = """net Inter-|   Receive                                                |  Transmit
net face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier
net lo: 5000 50 0 0 0 0 0 0 5000 50 0 0 0 0 0 0
net eth0:{eth_rx} 900 0 0 0 0 0 0 {eth_tx} 800 0 0 0 0 0 0
net ib0: {ib_rx} 10 0 0 0 0 0 0 {ib_tx} 10 0 0 0 0 0 0"""


def block(busy: int, idle: int, eth: tuple[int, int], ib: tuple[int, int], up: float, slow: bool = False) -> list[str]:
    lines = [f"cpu  {busy} 0 0 {idle} 0 0 0 0 0 0", "MemTotal: 16000000", "MemAvailable: 4000000",
             *NET.format(eth_rx=eth[0], eth_tx=eth[1], ib_rx=ib[0], ib_tx=ib[1]).splitlines(), f"up {up}"]
    if slow:
        lines += ["users 7", "disk /dev/sda2 1000000 850000 150000 85% /",
                  "disk /dev/sda2 1000000 850000 150000 85% /", "disk tmpfs 2000000 100000 1900000 5% /tmp"]
    return lines


def test_parse():
    s = monitor.parse(block(300, 700, (1000, 2000), (10, 20), 86400.5, slow=True))
    assert (s.busy, s.total) == (300, 1000)
    assert (s.mem_total, s.mem_free) == (16000000 * 1024, 4000000 * 1024)
    assert (s.rx, s.tx, s.nets) == (1010, 2020, ["eth0", "ib0"])  # lo left out, the glued eth0:123 read
    assert s.at == 86400.5 and s.users == 7
    assert s.disks == [{"mount": "/", "used": 850000 * 1024, "size": 1000000 * 1024, "percent": 85},
                       {"mount": "/tmp", "used": 100000 * 1024, "size": 2000000 * 1024, "percent": 5}]


def test_parse_cpu_leaves_out_iowait():
    s = monitor.parse(["cpu  100 10 40 800 50 0 0 0 0 0"])
    assert (s.busy, s.total) == (150, 1000)


def test_parse_only_physical_interfaces():
    """A bond and its links, or a bridge, would count the same traffic twice."""
    lines = ["net eth0: 100 1 0 0 0 0 0 0 10 1 0 0 0 0 0 0", "net bond0: 100 1 0 0 0 0 0 0 10 1 0 0 0 0 0 0"]
    assert monitor.parse(lines, {"eth0"}).rx == 100
    assert monitor.parse(lines).rx == 200


def test_parse_skips_what_it_does_not_understand():
    s = monitor.parse(["cpu  x y z w", "MemTotal: 1000", "users", "disk short", "up soon"])
    assert s.mem_total == 1024000 and s.users is None and s.disks is None and s.at == 0


def test_stats():
    a = monitor.parse(block(300, 700, (1000, 2000), (0, 0), 100.0, slow=True))
    b = monitor.parse(block(600, 1100, (4000, 2600), (2000, 0), 102.0))
    first = monitor.stats("node-a1", None, a)
    assert first["cpu"] is None and first["up"] is None and first["down"] is None
    assert first["mem_used"] == 12000000 * 1024 and first["users"] == 7 and first["disks"][0]["percent"] == 85
    got = monitor.stats("node-a1", a, b)
    assert got["host"] == "node-a1" and got["cpu"] == round(100 * 300 / 700, 1)
    assert (got["down"], got["up"]) == (2500.0, 300.0) and got["uptime"] == 102


def test_stats_counter_reset_gives_no_rate():
    a = monitor.parse(block(1, 1, (5000, 5000), (0, 0), 10.0))
    b = monitor.parse(block(2, 2, (10, 10), (0, 0), 13.0))
    assert monitor.stats("h", a, b)["down"] is None


def test_formatters():
    assert monitor.size(512) == "512 B"
    assert monitor.size(1536) == "1.5 KB"
    assert monitor.size(250 * 1024**2) == "250 MB"
    assert monitor.size(3 * 1024**5) == "3072 TB"
    assert monitor.rate(None) == "..." and monitor.rate(2048) == "2.0 KB/s"
    assert monitor.used_of(12.3 * 1024**3, 62 * 1024**3) == "12.3 / 62.0 GB"
    assert monitor.used_of(900 * 1024**2, 62 * 1024**3) == "900 MB / 62.0 GB"
    assert monitor.duration(3 * 3600 + 25 * 60) == "3h 25m"
    assert monitor.duration(12 * 86400 + 5 * 3600 + 59) == "12d 5h"
    assert [monitor.level(p) for p in (None, 79.9, 80, 89, 90, 100)] == ["", "", "warn", "warn", "high", "high"]


class FakeSsh:
    """argv() runs a local sh instead of the cluster: it prints what the script would, then waits."""

    def __init__(self, text: str):
        self.text, self.ran = text, []

    def argv(self, command=None, tty=False):
        self.ran.append(command)
        return ["sh", "-c", f"printf %s {shlex.quote(self.text)}; exec sleep 30"]


def collect(ssh, node: str, count: int):
    got, done = [], threading.Event()

    def fn(stats):
        got.append(stats)
        if len(got) >= count:
            done.set()
    unwatch = monitor.watch(ssh, node, fn)
    return got, done, unwatch


@posix
def test_sampler_gives_stats_and_stops():
    end = f"\n{monitor.END}\n"
    text = ("host node-a1\nnic eth0 ib0\n" + "\n".join(block(300, 700, (1000, 0), (0, 0), 100.0, slow=True)) + end
            + "\n".join(block(400, 800, (4000, 0), (0, 0), 103.0)) + end)
    ssh = FakeSsh(text)
    got, done, unwatch = collect(ssh, "node-a1", 2)
    assert done.wait(10)
    assert ssh.ran[0].startswith(monitor.tmux.NODE_SSH) and "node-a1" in ssh.ran[0]
    first, second = got[:2]
    assert first["host"] == "node-a1" and first["cpu"] is None
    assert second["cpu"] == 50.0 and second["down"] == 1000.0
    assert second["users"] == 7 and second["disks"] == first["disks"] and len(second["disks"]) == 2  # kept

    sampler = monitor._samplers[(id(ssh), "node-a1")]
    late, late_done, unwatch_late = collect(ssh, "node-a1", 1)
    assert late_done.wait(1) and late[0] == second  # the next watcher sees the last stats at once
    assert len(ssh.ran) == 1  # one loop per host, shared
    unwatch()
    assert sampler._proc and sampler._proc.poll() is None  # still watched
    unwatch_late()
    deadline = time.monotonic() + 5
    while (sampler._running or sampler._proc) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not sampler._running and not sampler._proc and (id(ssh), "node-a1") not in monitor._samplers


@posix
def test_the_script_runs_here(monkeypatch):
    """The real script, on this machine's /proc (Linux only), a bit faster."""
    if not Path("/proc/stat").exists():
        pytest.skip("no /proc")
    monkeypatch.setattr(monitor, "SCRIPT", monitor.SCRIPT.replace(f"sleep {monitor.INTERVAL}", "sleep 0.2"))

    class Local:
        def argv(self, command=None, tty=False):
            return ["sh", "-c", command]
    got, done, unwatch = collect(Local(), "", 2)
    try:
        assert done.wait(10)
    finally:
        unwatch()
    first, second = got[:2]
    assert first["host"] and first["mem_total"] > first["mem_used"] > 0 and first["uptime"] > 0
    assert any(d["mount"] in ("/", "/tmp") for d in first["disks"]) or not first["disks"]
    assert second["cpu"] is not None and 0 <= second["cpu"] <= 100 and second["down"] is not None
