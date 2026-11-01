"""One card per cluster: status, connect button, node info, log."""

import time
from collections.abc import Callable

from gi.repository import Adw, Gtk, Pango

from ...compute.ui.compute_dialog import ComputeDialog
from ...ui.widgets import open_menu
from ..session import ClusterSession, State
from .authenticator_help import AuthenticatorHelp
from .phone_pair import PhonePairDialog

MAX_LOG_LINES = 1000

PILL_CLASS = {
    State.CONNECTED: "success",
    State.ERROR: "error",
    State.DISCONNECTED: "dim-label",
}


def _label(text: str = "", *classes: str, xalign: float = 0) -> Gtk.Label:
    label = Gtk.Label(label=text, xalign=xalign, wrap=True, wrap_mode=Pango.WrapMode.WORD_CHAR)
    for c in classes:
        label.add_css_class(c)
    return label


class ClusterCard(Gtk.Box):
    def __init__(
        self,
        session: ClusterSession,
        on_connect: Callable[[ClusterSession], None],
        on_disconnect: Callable[[ClusterSession], None],
        on_settings: Callable[[ClusterSession], None],
        on_tool: Callable[[ClusterSession, str], None] = lambda s, t: None,
        save: Callable[[], None] = lambda: None,
    ):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        self.session = session
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect
        self.add_css_class("card")
        self.add_css_class("cluster-card")

        head = Gtk.Box(spacing=12)
        icon = Gtk.Image.new_from_icon_name("network-server-symbolic")
        icon.set_pixel_size(32)
        head.append(icon)

        titles = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True, valign=Gtk.Align.CENTER)
        self.title = _label("", "title-3")
        self.subtitle = _label("", "dim-label", "caption")
        titles.append(self.title)
        titles.append(self.subtitle)
        head.append(titles)

        self.pill = _label("", "status-pill", xalign=0.5)
        self.pill.set_wrap(False)
        self.pill.set_valign(Gtk.Align.CENTER)
        head.append(self.pill)

        gear = Gtk.Button(icon_name="emblem-system-symbolic", valign=Gtk.Align.CENTER,
                          tooltip_text=f"{session.cfg.name} settings")
        gear.add_css_class("flat")
        gear.connect("clicked", lambda *_: on_settings(session))
        phone = Gtk.Button(icon_name="phone-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                           tooltip_text="Connect phone: a QR code with this login for HPC Hub on your phone")
        phone.connect("clicked", lambda *_: PhonePairDialog([session], at_once=True).present(self))
        head.append(phone)
        head.append(gear)

        self.vpn_btn = Gtk.Button(label="VPN only", valign=Gtk.Align.CENTER, css_classes=["pill"],
                                  tooltip_text="Just the VPN tunnel, no SSH or compute node")
        self.vpn_btn.connect("clicked", lambda *_: on_connect(session, True))
        head.append(self.vpn_btn)
        self.code_help = Gtk.Button(icon_name="help-about-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                                    tooltip_text="How to set up Google Authenticator")
        self.code_help.connect("clicked", lambda *_: AuthenticatorHelp(session.cfg).present(self))
        head.append(self.code_help)

        self.action = Gtk.Button(valign=Gtk.Align.CENTER, width_request=120)
        self.action.add_css_class("pill")
        self.action.connect("clicked", self._on_action)
        head.append(self.action)
        self.append(head)

        self.save = save
        self.want_node = Gtk.CheckButton(active=session.cfg.request_node_on_connect,
                                         tooltip_text="Ask Slurm for a compute node when you connect")
        self.want_node.connect("toggled", self._on_want_node)
        self.append(self.want_node)

        status = Gtk.Box(spacing=8)
        self.spinner = Adw.Spinner()
        status.append(self.spinner)
        self.detail = _label("")
        self.detail.set_hexpand(True)
        status.append(self.detail)
        self.append(status)

        node_row = Gtk.Box(spacing=8)
        self.node = _label("", "heading")
        self.node.set_selectable(True)
        self.node.set_hexpand(True)
        self.node_btn = Gtk.Button(valign=Gtk.Align.CENTER, css_classes=["pill", "small"])
        self.node_btn.connect("clicked", self._on_node_btn)
        self.fast_btn = Gtk.Button(valign=Gtk.Align.CENTER, css_classes=["pill", "small"])
        self.fast_btn.connect("clicked", lambda *_: self.session.request_fast_node())
        node_row.append(self.node)
        node_row.append(self.fast_btn)
        node_row.append(self.node_btn)
        self.append(node_row)

        self.tools = open_menu(lambda key: on_tool(session, key))
        self.tools.set_halign(Gtk.Align.START)
        self.tools.set_margin_top(4)
        self.append(self.tools)

        self.log_view = Gtk.TextView(editable=False, monospace=True, cursor_visible=False,
                                     wrap_mode=Gtk.WrapMode.WORD_CHAR)
        self.log_view.add_css_class("log-view")
        scroller = Gtk.ScrolledWindow(min_content_height=160, child=self.log_view)
        self.expander = Gtk.Expander(label="Log", child=scroller)
        self.append(self.expander)

        self._asked = False  # the node dialog opened once for this pick (cfg.ask_node)
        self.refresh()

    def _on_want_node(self, btn) -> None:
        self.session.cfg.request_node_on_connect = btn.get_active()
        self.save()

    def _on_node_btn(self, *_):
        s = self.session
        if s.allocation:
            s.release_node()
            return
        self._node_dialog()

    def _node_dialog(self) -> None:
        s = self.session

        def go(profile, remember):
            if remember:
                s.cfg.profile = profile
                self.save()
            s.request_node(profile)
        ComputeDialog(f"Compute node on {s.cfg.name}", s, s.cfg.profile, go, go_label="Request").present(self)

    def _on_action(self, *_):
        state = self.session.state
        if state.busy:
            self.session.cancel()
        elif state == State.CONNECTED:
            self.on_disconnect(self.session)
        else:
            self.on_connect(self.session)

    def refresh(self) -> None:
        s, cfg = self.session, self.session.cfg
        self.title.set_label(cfg.name)
        where = cfg.host or "no host set"
        vpn = f"VPN {cfg.vpn.gateway or '(gateway not set)'}" if cfg.vpn.enabled else "no VPN"
        self.subtitle.set_label(f"{where} · {vpn}")
        asks = ", asks first" if cfg.ask_node else ""
        self.want_node.set_label(f"Compute node on connect: {cfg.profile.summary()}{asks}")
        if s.pick_node and not self._asked:
            self._asked = True
            self._node_dialog()
        self._asked = self._asked and s.pick_node
        self.want_node.set_active(cfg.request_node_on_connect)
        self.want_node.set_visible(s.state in (State.DISCONNECTED, State.ERROR))

        self.pill.set_label(s.state.value if s.state != State.DUO else "Duo")
        for c in ("success", "error", "warning", "dim-label"):
            self.pill.remove_css_class(c)
        self.pill.add_css_class(PILL_CLASS.get(s.state, "warning"))

        self.spinner.set_visible(s.state.busy)
        self.detail.set_label(s.detail)
        self.detail.set_visible(bool(s.detail))
        if s.state == State.DUO:
            self.detail.add_css_class("accent")
        else:
            self.detail.remove_css_class("accent")

        self.tools.set_visible(s.connected)
        self.vpn_btn.set_visible(cfg.vpn.enabled and (s.state in (State.DISCONNECTED, State.ERROR)))
        self.code_help.set_visible(cfg.second_factor == "code" and s.state in (State.DISCONNECTED, State.ERROR))
        a = s.allocation
        self.node.set_visible(s.connected)
        self.node_btn.set_visible(s.connected)
        fast = cfg.fast_profile()
        self.fast_btn.set_visible(s.connected and not a and fast is not None)
        if fast:
            self.fast_btn.set_label(cfg.fast_label())
            self.fast_btn.set_tooltip_text(f"Starts sooner, ends sooner: {fast.summary()}")
        if a:
            self.node.set_label(f"Node {a.node} · Job {a.job_id}" + ("" if a.owned else " (your job)"))
            self.node_btn.set_label("Release node" if a.owned else "Stop using")
            self.node_btn.set_tooltip_text("Cancel this job, stay connected" if a.owned
                                           else "Keep the job running, just stop using it here")
        else:
            self.node.set_label("No compute node")
            self.node_btn.set_label("Get node")
            self.node_btn.set_tooltip_text(f"Request {cfg.profile.summary()}")

        for c in ("suggested-action", "destructive-action"):
            self.action.remove_css_class(c)
        if s.state == State.DISCONNECTING:
            self.action.set_label("Disconnecting…")
            self.action.set_sensitive(False)
            return
        self.action.set_sensitive(True)
        if s.state.busy:
            self.action.set_label("Cancel")
        elif s.state == State.CONNECTED:
            self.action.set_label("Disconnect")
            self.action.add_css_class("destructive-action")
        else:
            self.action.set_label("Reconnect" if s.state == State.ERROR else "Connect")
            self.action.add_css_class("suggested-action")

    def append_log(self, line: str) -> None:
        buf = self.log_view.get_buffer()
        buf.insert(buf.get_end_iter(), f"{time.strftime('%H:%M:%S')}  {line}\n")
        extra = buf.get_line_count() - MAX_LOG_LINES
        if extra > 0:
            buf.delete(buf.get_start_iter(), buf.get_iter_at_line(extra)[1])
        mark = buf.get_mark("end") or buf.create_mark("end", buf.get_end_iter(), False)
        buf.move_mark(mark, buf.get_end_iter())
        self.log_view.scroll_to_mark(mark, 0, False, 0, 1)
