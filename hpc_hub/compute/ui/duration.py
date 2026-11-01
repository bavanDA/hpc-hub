"""Days, hours and minutes for a job's time, never more than the cluster allows."""

from gi.repository import Adw, Gtk

from ..limits import Limits, human


class DurationRow(Adw.ActionRow):
    def __init__(self, title: str, total: int, limits: Limits | None = None, partition: str = "", qos: str = ""):
        super().__init__(title=title)
        self.limits, self.top, self._busy = limits, None, False
        box = Gtk.Box(spacing=4, valign=Gtk.Align.CENTER)
        self.spins = []
        for unit, high in (("d", 99), ("h", 23), ("min", 59)):
            spin = Gtk.SpinButton.new_with_range(0, high, 1)
            spin.set_numeric(True)
            spin.connect("value-changed", lambda *_: self._changed())
            self.spins.append(spin)
            box.append(spin)
            box.append(Gtk.Label(label=unit, css_classes=["dim-label"], margin_end=6))
        self.add_suffix(box)
        self.set_minutes(total)
        self.set_queue(partition, qos)

    def minutes(self) -> int:
        d, h, m = (int(s.get_value()) for s in self.spins)
        return d * 1440 + h * 60 + m

    def set_minutes(self, total: int) -> None:
        self._busy = True
        d, rest = divmod(max(int(total), 1), 1440)
        for spin, value in zip(self.spins, (d, *divmod(rest, 60))):
            spin.set_value(value)
        self._busy = False
        self._changed()

    def set_queue(self, partition: str, qos: str) -> None:
        """The partition and QoS the job goes to decide the longest time."""
        if not self.limits:
            self.top = None
            self.set_subtitle("Max shown after you connect")
            return
        self.top, why = self.limits.longest(partition, qos)
        self.set_subtitle(f"Longest allowed: {human(self.top)} ({why})" if self.top else "No time limit here")
        self._changed()

    def _changed(self) -> None:
        if self._busy:
            return
        total = self.minutes()
        if self.top and total > self.top:
            self.set_minutes(self.top)
        elif total < 1:
            self.set_minutes(1)
