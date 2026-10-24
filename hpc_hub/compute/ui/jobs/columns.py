"""The job table's columns: what each cell shows and how state is colored."""

from gi.repository import GObject, Gtk, Pango

from ...jobs import JobInfo

STATE_CLASS = {"RUNNING": "success", "PENDING": "warning", "COMPLETING": "accent",
               "FAILED": "error", "TIMEOUT": "error", "OUT_OF_MEMORY": "error", "NODE_FAIL": "error"}
COLUMNS = [  # (title, attribute, expand)
    ("ID", "job_id", False), ("Name", "name", True), ("User", "user", False),
    ("Partition · QoS", "queue", False), ("State", "state", False), ("Time / limit", "time", False),
    ("CPUs · mem", "res", False), ("SU used / max", "su", False),
    ("Node / reason", "where", False),
]
ACTIVE = ("RUNNING", "PENDING", "SUSPENDED", "REQUEUED", "COMPLETING")


def su_text(j: JobInfo) -> str:
    """SU = core hours charged. Free QoS (usage factor 0) costs nothing."""
    if j.factor == 0:
        return "free"
    if j.state in ACTIVE:
        return f"{j.su_spent:,.1f} / {j.su_max:,.0f}"
    return f"{j.su_spent:,.1f}"


class JobItem(GObject.Object):
    def __init__(self, job: JobInfo):
        super().__init__()
        self.job = job


def _setup(_f, item, shorten: bool):
    """Only the wide text columns (name, node) shorten; ids, times and numbers stay whole."""
    label = Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.END if shorten else Pango.EllipsizeMode.NONE,
                      width_chars=12 if shorten else -1)
    item.set_child(label)


def _binder(attr: str):
    def bind(_f, item):
        label: Gtk.Label = item.get_child()
        job: JobInfo = item.get_item().job
        text = (su_text(job) if attr == "su" else f"{job.elapsed} / {job.limit}" if attr == "time"
                else f"{job.cpus} · {job.mem}" if attr == "res"
                else " · ".join(x for x in (job.partition, job.qos) if x) if attr == "queue" else getattr(job, attr))
        if attr == "name" and job.from_app:
            text = f"{text}  (started by HPC Hub)"
        label.set_label(text)
        label.set_tooltip_text(text)
        for c in set(STATE_CLASS.values()):
            label.remove_css_class(c)
        if attr == "state" and text in STATE_CLASS:
            label.add_css_class(STATE_CLASS[text])
    return bind


def add_columns(view: Gtk.ColumnView) -> Gtk.ColumnViewColumn:
    """Append the job columns; returns User, which only "All jobs" needs (the rest are yours)."""
    user_col = None
    for title, attr, expand in COLUMNS:
        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", _setup, expand)
        factory.connect("bind", _binder(attr))
        col = Gtk.ColumnViewColumn(title=title, factory=factory, expand=expand, resizable=True)
        view.append_column(col)
        if attr == "user":
            user_col = col
    return user_col
