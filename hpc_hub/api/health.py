"""Keeps an eye on live connections, like the GTK app's _health_check and _watch_sleep: every 30 s each connected
cluster is checked (healthy(), then check_node()), a lost one is marked, and right after the computer wakes up
all are checked again (VPN and SSH rarely survive sleep). Waking up is heard from logind over D-Bus on Linux;
elsewhere it shows as the wall clock jumping ahead of the monotonic one (which stops while asleep)."""

import threading
import time
from collections.abc import Callable, Iterable

from ..connect.state import State

EVERY = 30.0  # seconds between checks
TICK = 5.0  # how often the loop looks at the clocks
AFTER_WAKE = 5.0  # the network needs a moment after waking up
JUMP = 20.0  # wall clock this far ahead of the monotonic clock: the computer slept


class Health:
    def __init__(self, sessions: Callable[[], Iterable], every: float = EVERY, tick: float = TICK,
                 after_wake: float = AFTER_WAKE):
        self.sessions, self.every, self.tick, self.after_wake = sessions, every, tick, after_wake
        self.jumps = True  # watch the clocks (off once logind tells us instead)
        self.stop = threading.Event()
        self._wake = threading.Event()
        self._busy: set[str] = set()
        self._lock = threading.Lock()

    def check_all(self) -> None:
        """Check every connected session on its own thread; one still being checked is left alone."""
        for s in list(self.sessions()):
            if s.state != State.CONNECTED:
                continue
            with self._lock:
                if s.cfg.id in self._busy:
                    continue
                self._busy.add(s.cfg.id)
            threading.Thread(target=self._check_one, args=(s,), daemon=True).start()

    def _check_one(self, s) -> None:
        try:
            if not s.healthy():
                s.mark_lost()
            else:
                s.check_node()
        except Exception:  # noqa: BLE001 - a check that breaks tells nothing; the next one tries again
            pass
        finally:
            with self._lock:
                self._busy.discard(s.cfg.id)

    def resumed(self) -> None:
        """The computer woke up (any thread)."""
        self._wake.set()

    def run(self) -> None:
        wall, mono = time.time(), time.monotonic()
        last = mono
        while not self.stop.is_set():
            woke = self._wake.wait(self.tick)
            now_wall, now_mono = time.time(), time.monotonic()
            slept = self.jumps and (now_wall - wall) - (now_mono - mono) > JUMP
            wall, mono = now_wall, now_mono
            if woke or slept:
                self._wake.clear()
                if self.stop.wait(self.after_wake):
                    return
                wall, mono = time.time(), time.monotonic()
                self.check_all()
                last = mono
            elif now_mono - last >= self.every:
                self.check_all()
                last = now_mono


def watch_sleep(on_resume: Callable[[], None]) -> bool:
    """Call on_resume when logind says the computer woke up. False: no logind here (not Linux, no D-Bus)."""
    try:
        from gi.repository import Gio, GLib
    except (ImportError, ValueError):
        return False
    ready, ok = threading.Event(), []

    def on_signal(_bus, _sender, _path, _iface, _signal, params) -> None:
        if not params.unpack()[0]:  # False = resumed
            on_resume()

    def loop() -> None:
        ctx = GLib.MainContext.new()
        ctx.push_thread_default()  # the signal comes on this thread's own loop
        try:
            bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
            bus.signal_subscribe("org.freedesktop.login1", "org.freedesktop.login1.Manager", "PrepareForSleep",
                                 "/org/freedesktop/login1", None, Gio.DBusSignalFlags.NONE, on_signal)
        except GLib.Error:
            ready.set()
            return
        ok.append(True)
        ready.set()
        GLib.MainLoop.new(ctx, False).run()

    threading.Thread(target=loop, name="sleep-watch", daemon=True).start()
    ready.wait(5)
    return bool(ok)


def start() -> Health:
    """Start watching the hub's sessions (python -m hpc_hub.api calls this once)."""
    from .hub import hub
    h = Health(lambda: hub().sessions.values())
    h.jumps = not watch_sleep(h.resumed)
    threading.Thread(target=h.run, name="health", daemon=True).start()
    return h
