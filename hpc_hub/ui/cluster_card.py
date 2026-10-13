"""One card per cluster: status, connect button, node info, log."""

import time
from collections.abc import Callable

from gi.repository import Adw, Gtk, Pango

from ..session import ClusterSession, State

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

        gear = Gtk.Button(icon_name="emblem-system-symbolic", valign=Gtk.Align.CENTER, tooltip_text="Settings")
        gear.add_css_class("flat")
        gear.connect("clicked", lambda *_: on_settings(session))
        head.append(gear)

        self.action = Gtk.Button(valign=Gtk.Align.CENTER, width_request=120)
        self.action.add_css_class("pill")
        self.action.connect("clicked", self._on_action)
        head.append(self.action)
        self.append(head)

        self.profile = _label("", "dim-label")
        self.append(self.profile)

        status = Gtk.Box(spacing=8)
        self.spinner = Adw.Spinner()
        status.append(self.spinner)
        self.detail = _label("")
        self.detail.set_hexpand(True)
        status.append(self.detail)
        self.append(status)

        self.node = _label("", "heading")
        self.node.set_selectable(True)
        self.append(self.node)

        self.tools = Gtk.Box(spacing=6, margin_top=4)
        for name, label, icon in (("vscode", "VS Code", "text-editor-symbolic"),
                                  ("vscode-settings", "", "emblem-system-symbolic"),
                                  ("claude", "Claude", "user-available-symbolic"),
                                  ("files", "Files", "folder-symbolic")):
            if label:
                btn = Gtk.Button(child=Adw.ButtonContent(label=label, icon_name=icon), tooltip_text=f"Open {label}")
            else:
                btn = Gtk.Button(icon_name=icon, tooltip_text="VS Code settings", css_classes=["flat"])
            btn.connect("clicked", lambda _b, n=name: on_tool(session, n))
            self.tools.append(btn)
        self.append(self.tools)

        self.log_view = Gtk.TextView(editable=False, monospace=True, cursor_visible=False,
                                     wrap_mode=Gtk.WrapMode.WORD_CHAR)
        self.log_view.add_css_class("log-view")
        scroller = Gtk.ScrolledWindow(min_content_height=160, child=self.log_view)
        self.expander = Gtk.Expander(label="Log", child=scroller)
        self.append(self.expander)

        self.refresh()

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
        self.profile.set_label(f"Compute: {cfg.profile.summary()}")

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

        self.tools.set_visible(s.state == State.CONNECTED)
        a = s.allocation
        self.node.set_visible(bool(a) and s.state == State.CONNECTED)
        if a:
            self.node.set_label(f"Node {a.node} · Job {a.job_id}" + ("" if a.owned else " (your job)"))

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
