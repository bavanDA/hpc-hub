"""Ask which resources to use before something requests a node, with your saved choice filled in."""

from collections.abc import Callable

from gi.repository import Adw, Gtk

from ..config import ComputeProfile
from ..session import ClusterSession
from .settings import ProfileRows


class ComputeGroup(Adw.PreferencesGroup):
    """Cores, memory, GPUs and time up front; partition, account, QOS and extra arguments folded away."""

    def __init__(self, s: ClusterSession, profile: ComputeProfile, extra_title: str = "Extra salloc arguments",
                 **kw):
        super().__init__(**kw)
        self.rows = ProfileRows(profile, extra_title, s.limits)
        r = self.rows
        for row in (r.cpus, r.mem, r.gpus, r.time):
            self.add(row)
        more = Adw.ExpanderRow(title="Partition, account and QOS",
                               subtitle=" · ".join(x for x in (profile.partition, profile.account, profile.qos) if x)
                               or "The cluster's defaults")
        for row in (r.partition, r.account, r.qos, r.extra):
            more.add_row(row)
        self.add(more)

    def read(self) -> ComputeProfile:
        return self.rows.read()


class ComputeDialog(Adw.Dialog):
    """on_go(profile, remember) when you press Start; nothing when you cancel."""

    def __init__(self, title: str, s: ClusterSession, profile: ComputeProfile,
                 on_go: Callable[[ComputeProfile, bool], None], extra: Adw.PreferencesGroup | None = None,
                 extra_title: str = "Extra salloc arguments", go_label: str = "Start"):
        super().__init__(title=title, content_width=600)
        self.on_go = on_go
        page = Adw.PreferencesPage()
        if extra:
            page.add(extra)
        self.compute = ComputeGroup(s, profile, extra_title, title="Compute node")
        page.add(self.compute)
        keep = Adw.PreferencesGroup()
        self.remember = Adw.SwitchRow(title="Use these next time", active=True)
        keep.add(self.remember)
        page.add(keep)

        cancel = Gtk.Button(label="Cancel")
        cancel.connect("clicked", lambda *_: self.close())
        go = Gtk.Button(label=go_label, css_classes=["suggested-action"])
        go.connect("clicked", lambda *_: self._go())
        bar = Adw.HeaderBar(show_end_title_buttons=False, show_start_title_buttons=False)
        bar.pack_start(cancel)
        bar.pack_end(go)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(bar)
        self.set_child(tv)
        self.set_default_widget(go)

    def _go(self) -> None:
        profile, remember = self.compute.read(), self.remember.get_active()
        self.close()
        self.on_go(profile, remember)
