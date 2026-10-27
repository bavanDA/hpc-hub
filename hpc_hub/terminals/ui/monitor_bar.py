"""The monitoring bar under a session's terminal, like MobaXterm's: host, CPU, memory, network, uptime, users and
disks of the host the session runs on. It watches only while it is on screen (see terminals/monitor.py)."""

import weakref

from gi.repository import Gio, GLib, Gtk

from ...core import features
from .. import monitor

_bars: "weakref.WeakSet[MonitorBar]" = weakref.WeakSet()


def show_all(on: bool) -> None:
    """Preferences: Monitoring bar. A hidden bar is unmapped, so it stops watching."""
    for bar in list(_bars):
        bar.set_visible(on)


class _Item(Gtk.Box):
    """A small icon and a short text; orange from 80%, red from 90%; details in the tooltip."""

    def __init__(self, *icons: str, text: str = "..."):
        super().__init__(spacing=4, css_classes=["monitor-item"])
        self.append(Gtk.Image(gicon=Gio.ThemedIcon.new_from_names(list(icons)), pixel_size=12))
        self.label = Gtk.Label(label=text, css_classes=["monitor-value"])
        self.append(self.label)

    def show(self, text: str, tip: str, level: str = "") -> None:
        self.label.set_label(text)
        self.set_tooltip_text(tip)
        for name in ("warn", "high"):
            if name == level:
                self.add_css_class(name)
            else:
                self.remove_css_class(name)


def _percent(part: float, whole: float) -> float | None:
    return 100 * part / whole if whole else None


class MonitorBar(Gtk.Box):
    def __init__(self, ssh, node: str = ""):
        super().__init__(css_classes=["monitor-bar"], visible=features.monitor_bar)
        self.ssh, self.node = ssh, node
        self._unwatch = None
        self._disks: list[dict] | None = None
        row = Gtk.Box(spacing=14)
        # clipped, not wider than the terminal: a narrow window must still be able to shrink
        self.append(Gtk.ScrolledWindow(child=row, hexpand=True, hscrollbar_policy=Gtk.PolicyType.EXTERNAL,
                                       vscrollbar_policy=Gtk.PolicyType.NEVER, propagate_natural_height=True))
        self.host = _Item("computer-symbolic", text=node or "login node")
        self.cpu = _Item("utilities-system-monitor-symbolic", "org.gnome.SystemMonitor-symbolic",
                         "power-profile-performance-symbolic")
        self.mem = _Item("memory-symbolic", "drive-harddisk-solidstate-symbolic")
        self.up = _Item("go-up-symbolic", "network-transmit-symbolic")
        self.down = _Item("go-down-symbolic", "network-receive-symbolic")
        self.uptime = _Item("document-open-recent-symbolic")
        self.users = _Item("system-users-symbolic")
        for item in (self.host, self.cpu, self.mem, self.up, self.down, self.uptime, self.users):
            row.append(item)
        self.disks = Gtk.Box(spacing=14)
        row.append(self.disks)
        self.connect("map", lambda *_: self._watch())
        self.connect("unmap", lambda *_: self._stop())
        _bars.add(self)

    def _watch(self) -> None:
        if self._unwatch is None and features.monitor_bar:
            self._unwatch = monitor.watch(self.ssh, self.node, lambda stats: GLib.idle_add(self._show, stats))

    def _stop(self) -> None:
        if self._unwatch:
            self._unwatch()
            self._unwatch = None

    def _show(self, st: dict) -> bool:
        if self._unwatch is None:  # it arrived after we stopped watching
            return False
        self.host.show(st["host"], f"Host: {st['host']}")
        cpu = st["cpu"]
        self.cpu.show("..." if cpu is None else f"{cpu:.0f}%",
                      "CPU: waiting for a second sample" if cpu is None else f"CPU: {cpu:.1f}% of all cores in use",
                      monitor.level(cpu))
        used, total = st["mem_used"], st["mem_total"]
        mem = _percent(used, total)
        self.mem.show(monitor.used_of(used, total),
                      f"Memory: {monitor.size(used)} of {monitor.size(total)} in use"
                      + (f" ({mem:.0f}%)" if mem is not None else ""), monitor.level(mem))
        nets = f" ({', '.join(st['nets'])})" if st.get("nets") else ""
        self.up.show(monitor.rate(st["up"]), f"Upload: {monitor.rate(st['up'])}{nets}")
        self.down.show(monitor.rate(st["down"]), f"Download: {monitor.rate(st['down'])}{nets}")
        self.uptime.show(monitor.duration(st["uptime"]), f"Up for {monitor.duration(st['uptime'])}")
        n = st["users"]
        self.users.show(str(n), f"{n} {'person' if n == 1 else 'people'} logged in")
        if st["disks"] == self._disks:  # they change once a minute at most
            return False
        self._disks = st["disks"]
        while child := self.disks.get_first_child():
            self.disks.remove(child)
        for d in st["disks"]:
            item = _Item("drive-harddisk-symbolic")
            item.show(f"{d['mount']}: {d['percent']}%",
                      f"Disk {d['mount']}: {monitor.size(d['used'])} of {monitor.size(d['size'])} used",
                      monitor.level(d["percent"]))
            self.disks.append(item)
        return False
