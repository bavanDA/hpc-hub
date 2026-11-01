"""The job table's columns, like the desktop app's JobTable.tsx: one line per job, the state as a pill, time used as
a small bar, the pending reason in words, numbers lined up on the right."""

from gi.repository import GObject, Gtk, Pango

from ....ui.status import StatusPill
from ...jobs import JobInfo, duration_text, reason_text, seconds, shown_qos

# (title, kind, expand); kind picks the cell widget below
COLUMNS = [
    ("ID", "id", False), ("Name", "name", True), ("User", "user", False), ("State", "state", False),
    ("Time used", "time", False), ("CPUs · memory", "res", False), ("SU", "su", False),
    ("Node or reason", "where", False),
]
ACTIVE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED", "COMPLETING")
RIGHT = {"res", "su"}  # numbers line up on the right


def su_text(j: JobInfo) -> str:
    """SU = core hours charged. Free QoS (usage factor 0) costs nothing."""
    if j.factor == 0:
        return "free"
    if j.state in ACTIVE:
        return f"{j.su_spent:,.1f} / {j.su_max:,.0f}"
    return f"{j.su_spent:,.1f}"


def mem_text(mem: str) -> str:
    """ "16 GB" for Slurm's "16G". """
    return f"{mem[:-1]} {mem[-1].upper()}B" if mem[-1:].upper() in "KMGT" and mem[:-1].replace(".", "").isdigit() \
        else mem


def time_share(j: JobInfo) -> float | None:
    """How much of its time limit a job has used (0..1); None while it waits or without a limit."""
    if j.state == "PENDING":
        return None
    if j.state == "TIMEOUT":
        return 1.0
    limit = seconds(j.limit)
    return min(1.0, seconds(j.elapsed) / limit) if limit else None


class JobItem(GObject.Object):
    def __init__(self, job: JobInfo):
        super().__init__()
        self.job = job


def _label(**kw) -> Gtk.Label:
    return Gtk.Label(xalign=kw.pop("xalign", 0), **kw)


def _setup(_f, item, kind: str):
    if kind == "state":
        item.set_child(StatusPill())
    elif kind == "name":
        box = Gtk.Box(spacing=8)
        box.append(_label(ellipsize=Pango.EllipsizeMode.END, width_chars=12, hexpand=False))
        box.append(_label(css_classes=["dim-label", "caption"]))
        item.set_child(box)
    elif kind == "time":
        box = Gtk.Box(spacing=8)
        bar = Gtk.LevelBar(min_value=0, max_value=1, valign=Gtk.Align.CENTER, width_request=36,
                           css_classes=["time-bar"])
        for name in ("low", "high", "full"):  # our own colors (style.py), not GTK's traffic light
            bar.remove_offset_value(name)
        box.append(bar)
        box.append(_label(css_classes=["numeric"]))
        box.append(_label(css_classes=["dim-label", "caption"]))
        item.set_child(box)
    else:
        css = ["numeric"] if kind in ("id", "res", "su") else []
        if kind == "id":
            css.append("dim-label")
        item.set_child(_label(xalign=1 if kind in RIGHT else 0, css_classes=css,
                              ellipsize=Pango.EllipsizeMode.END if kind == "where" else Pango.EllipsizeMode.NONE,
                              max_width_chars=32 if kind == "where" else -1))


def _bind(kind: str):
    def bind(_f, item):
        j: JobInfo = item.get_item().job
        w = item.get_child()
        if kind == "state":
            w.set(j.state.capitalize().replace("_", " "))  # "Running", "Out of memory"
        elif kind == "name":
            name, extra = w.get_first_child(), w.get_last_child()
            name.set_label(j.name)
            name.set_tooltip_text(j.name)
            extra.set_label(" · ".join(x for x in (j.partition, shown_qos(j), "HPC Hub" if j.from_app else "") if x))
        elif kind == "time":
            bar = w.get_first_child()
            used, of = bar.get_next_sibling(), w.get_last_child()
            share = time_share(j)
            bar.set_visible(share is not None)
            if share is not None:
                bar.set_value(share)
                for css, on in (("warn", 0.85 <= share < 1), ("over", share >= 1)):
                    (bar.add_css_class if on else bar.remove_css_class)(css)
            if j.state == "PENDING":
                used.set_label("not started")
                used.add_css_class("dim-label")
                of.set_label("")
            else:
                used.set_label(duration_text(seconds(j.elapsed)))
                used.remove_css_class("dim-label")
                of.set_label(f"of {duration_text(seconds(j.limit))}" if seconds(j.limit) else "")
        elif kind == "where":
            reason = reason_text(j.where) if j.state == "PENDING" else ""
            w.set_label(reason or j.where)
            w.set_tooltip_text(reason or j.where)
            (w.add_css_class if reason else w.remove_css_class)("dim-label")
            (w.remove_css_class if reason else w.add_css_class)("monospace")
        else:
            w.set_label(su_text(j) if kind == "su" else f"{j.cpus} · {mem_text(j.mem)}" if kind == "res"
                        else j.job_id if kind == "id" else getattr(j, kind))
            if kind == "su":
                (w.add_css_class if j.factor == 0 else w.remove_css_class)("dim-label")
    return bind


def add_columns(view: Gtk.ColumnView) -> Gtk.ColumnViewColumn:
    """Append the job columns; returns User, which only My group and All jobs need (the rest are yours)."""
    user_col = None
    for title, kind, expand in COLUMNS:
        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", _setup, kind)
        factory.connect("bind", _bind(kind))
        col = Gtk.ColumnViewColumn(title=title, factory=factory, expand=expand, resizable=True)
        view.append_column(col)
        if kind == "user":
            user_col = col
    return user_col
