"""The monitoring bar under a terminal, like MobaXterm's: CPU, memory, network, uptime, users and disks of the host
the terminal runs on (the login node, or the compute node its tmux runs on).

Light on purpose, because HPC admins dislike tools that poll login nodes: one shell loop per host, over the
connection that is already open, reads a few /proc files with shell builtins every INTERVAL seconds (no new
process but sleep) and runs who and df (local disks only) once a minute. It runs only while someone watches, and
ends by itself after MAX_SAMPLES so nothing stays behind.
"""

import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from . import tmux

INTERVAL = 3  # seconds between samples
SLOW_EVERY = 20  # samples between two who and df runs (a minute)
MAX_SAMPLES = 1200  # an hour; started again while still watched
RETRY = 30  # seconds before trying again when the loop could not start, doubled each time up to MAX_RETRY
MAX_RETRY = 600
END = "@@hpchub-monitor"

SCRIPT = f"""echo host $(hostname -s 2>/dev/null || hostname)
echo nic $(for i in /sys/class/net/*; do [ -e "$i/device" ] && echo "${{i##*/}}"; done)
n=0; while [ $n -lt {MAX_SAMPLES} ]; do
read -r l < /proc/stat; echo "$l"
while read -r k v _; do case $k in MemTotal:|MemAvailable:) echo "$k $v";; esac; done < /proc/meminfo
while read -r l; do echo "net $l"; done < /proc/net/dev
read -r u _ < /proc/uptime; echo "up $u"
if [ $((n % {SLOW_EVERY})) = 0 ]; then echo users $(who 2>/dev/null | cut -d' ' -f1 | sort -u | wc -l)
timeout 5 df -P -k -l / /tmp 2>/dev/null | sed -n '2,$s/^/disk /p'; fi
echo {END}; n=$((n+1)); sleep {INTERVAL}; done"""


@dataclass
class Sample:
    busy: int = 0  # CPU time, all cores
    total: int = 0
    mem_total: int = 0  # bytes
    mem_free: int = 0
    rx: int = 0  # bytes since boot: physical interfaces, or all but lo when none is known
    tx: int = 0
    at: float = 0  # the host's uptime in seconds, as a clock for the rates
    users: int | None = None  # different people logged in; None: not read this time
    disks: list[dict] | None = None  # None: not read this time
    nets: list[str] = field(default_factory=list)


def parse(lines: list[str], nics: set[str] | None = None) -> Sample:
    """One block of the script's output. nics: the physical interfaces (so a bond and its links count once)."""
    s = Sample()
    for line in lines:
        try:
            _line(s, line, nics)
        except (ValueError, IndexError):  # a line we don't understand must not end the bar
            continue
    return s


def _line(s: Sample, line: str, nics: set[str] | None) -> None:
    kind, _, rest = line.partition(" ")
    f = rest.split()
    if kind == "cpu" and len(f) >= 4:
        nums = [int(x) for x in f[:8]]  # user nice system idle iowait irq softirq steal; guest is in user
        s.total = sum(nums)
        s.busy = s.total - nums[3] - (nums[4] if len(nums) > 4 else 0)
    elif kind == "MemTotal:" and f:
        s.mem_total = int(f[0]) * 1024
    elif kind == "MemAvailable:" and f:
        s.mem_free = int(f[0]) * 1024
    elif kind == "net" and ":" in rest:
        name, _, counters = rest.partition(":")
        name, nums = name.strip(), counters.split()
        if name != "lo" and (not nics or name in nics) and len(nums) >= 9:
            s.rx += int(nums[0])
            s.tx += int(nums[8])
            s.nets.append(name)
    elif kind == "up" and f:
        s.at = float(f[0])
    elif kind == "users" and f:
        s.users = int(f[0])
    elif kind == "disk" and len(f) >= 6:
        mount = " ".join(f[5:])
        if s.disks is None:
            s.disks = []
        if all(d["mount"] != mount for d in s.disks):
            s.disks.append({"mount": mount, "used": int(f[2]) * 1024, "size": int(f[1]) * 1024,
                            "percent": int(f[4].rstrip("%"))})


def stats(host: str, prev: Sample | None, cur: Sample) -> dict:
    """What the bar shows. cpu, up and down need two samples: None until the second one."""
    out = {"host": host, "cpu": None, "mem_used": max(0, cur.mem_total - cur.mem_free), "mem_total": cur.mem_total,
           "up": None, "down": None, "uptime": int(cur.at), "users": cur.users or 0, "disks": cur.disks or [],
           "nets": cur.nets}
    if prev:
        if cur.total > prev.total:
            out["cpu"] = round(min(100.0, max(0.0, 100 * (cur.busy - prev.busy) / (cur.total - prev.total))), 1)
        seconds = cur.at - prev.at
        if seconds > 0 and cur.rx >= prev.rx and cur.tx >= prev.tx:  # a counter that went back: reset, skip it
            out["down"] = (cur.rx - prev.rx) / seconds
            out["up"] = (cur.tx - prev.tx) / seconds
    return out


class Sampler:
    """One loop on one host, shared by everyone watching it."""

    def __init__(self, ssh, node: str):
        self.ssh, self.node = ssh, node
        self.watchers: dict[int, Callable[[dict], None]] = {}
        self.last: dict | None = None
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._running = False

    def add(self, key: int, fn: Callable[[dict], None]) -> dict | None:
        """Starts the loop unless it runs. Gives the last stats, for fn to show right away."""
        with self._lock:
            self.watchers[key] = fn
            start, self._running = not self._running, True
            last = self.last
        if start:
            threading.Thread(target=self._loop, daemon=True, name=f"monitor-{self.node or 'login'}").start()
        return last

    def remove(self, key: int) -> bool:
        """True when nobody watches any more (the loop stops)."""
        with self._lock:
            self.watchers.pop(key, None)
            if self.watchers:
                return False
            proc = self._proc
        if proc and proc.poll() is None:
            proc.terminate()
        return True

    def _watched(self) -> bool:
        with self._lock:  # decided under the lock, so add() never counts on a loop that is ending
            if not self.watchers:
                self._running = False
            return bool(self.watchers)

    def _loop(self) -> None:
        wait = RETRY
        while self._watched():
            if self._once():
                wait = RETRY
                continue
            time.sleep(wait)  # it failed (connection gone, job ended?): no new login every few seconds
            wait = min(wait * 2, MAX_RETRY)

    def _once(self) -> int:
        """Run the script until it ends or nobody watches. Gives how many samples came."""
        try:
            proc = subprocess.Popen(self.ssh.argv(tmux.on(self.node, SCRIPT)), stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, errors="replace")
        except Exception:  # noqa: BLE001 - no ssh, or the connection is gone: the loop tries again later
            return 0
        with self._lock:
            self._proc = proc
            watched = bool(self.watchers)
        if not watched:
            proc.terminate()
        host, nics, prev, users, disks, lines, count = self.node or "login node", None, None, 0, [], [], 0
        for line in proc.stdout:
            line = line.rstrip("\n")
            if line.startswith("host "):
                host = line[5:].strip() or host
            elif line.startswith("nic "):
                nics = set(line[4:].split()) or None
            elif line != END:
                lines.append(line)
            else:
                cur = parse(lines, nics)
                lines = []
                users = cur.users = users if cur.users is None else cur.users
                disks = cur.disks = disks if cur.disks is None else cur.disks
                self.last = stats(host, prev, cur)
                prev, count = cur, count + 1
                with self._lock:
                    watchers = list(self.watchers.values())
                for fn in watchers:
                    fn(self.last)
                if not watchers:
                    break
        if proc.poll() is None:
            proc.terminate()
        proc.wait()
        with self._lock:
            self._proc = None
        return count


_samplers: dict[tuple[int, str], Sampler] = {}
_lock = threading.Lock()
_next = 0


def watch(ssh, node: str, fn: Callable[[dict], None]) -> Callable[[], None]:
    """fn gets the host's stats every INTERVAL seconds (from a thread) until the returned unwatch is called."""
    global _next
    with _lock:
        _next += 1
        key, where = _next, (id(ssh), node)
        sampler = _samplers.setdefault(where, Sampler(ssh, node))
        last = sampler.add(key, fn)
    if last:
        fn(last)

    def unwatch() -> None:
        with _lock:
            if sampler.remove(key) and _samplers.get(where) is sampler:
                del _samplers[where]
    return unwatch
