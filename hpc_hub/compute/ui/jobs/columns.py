"""The job table's columns: what each cell shows and how state is colored."""

from gi.repository import GObject, Gtk, Pango

from ....ui.status import StatusPill
from ...jobs import JobInfo

NUMERIC = {"job_id", "time", "res", "su"}  # tabular digits, so the columns line up
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


def _setup(_f, item, shorten: bool, attr: str):
    """Only the wide text columns (name, node) shorten; ids, times and numbers stay whole. State is a pill."""
    if attr == "state":
        item.set_child(StatusPill())
        return
    label = Gtk.Label(xalign=0, ellipsize=Pango.EllipsizeMode.END if shorten else Pango.EllipsizeMode.NONE,
                      width_chars=12 if shorten else -1, css_classes=["numeric"] if attr in NUMERIC else [])
    item.set_child(label)


def _binder(attr: str):
    def bind(_f, item):
        job: JobInfo = item.get_item().job
        if attr == "state":
            item.get_child().set(job.state.capitalize().replace("_", " "))  # "Running", "Out of memory"
            return
        label: Gtk.Label = item.get_child()
        text = (su_text(job) if attr == "su" else f"{job.elapsed} / {job.limit}" if attr == "time"
                else f"{job.cpus} · {job.mem}" if attr == "res"
                else " · ".join(x for x in (job.partition, job.qos) if x) if attr == "queue" else getattr(job, attr))
        if attr == "name" and job.from_app:
            text = f"{text}  (started by HPC Hub)"
        label.set_label(text)
        label.set_tooltip_text(text)
    return bind


def add_columns(view: Gtk.ColumnView) -> Gtk.ColumnViewColumn:
    """Append the job columns; returns User, which only "All jobs" needs (the rest are yours)."""
    user_col = None
    for title, attr, expand in COLUMNS:
        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", _setup, expand, attr)
        factory.connect("bind", _binder(attr))
        col = Gtk.ColumnViewColumn(title=title, factory=factory, expand=expand, resizable=True)
        view.append_column(col)
        if attr == "user":
            user_col = col
    return user_col
