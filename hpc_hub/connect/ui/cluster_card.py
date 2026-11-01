"""One card per cluster, like the desktop app's ClusterCard.tsx. The status says where you are; the main button is
the next thing to do (Connect, Cancel); once connected, the things you open (Terminal, VS Code, Files, Agents) sit
in one row and the rest (the node, VPN only, Disconnect) in the ⋮ menu."""

import time
from collections.abc import Callable

from gi.repository import Adw, Gio, GLib, Gtk, Pango

from ...agents.catalog import AGENTS
from ...compute.ui.compute_dialog import ComputeDialog
from ...ui.status import TEXT_CLASS, kind_for
from ..session import ClusterSession, State
from .phone_pair import PhonePairDialog

MAX_LOG_LINES = 1000
DOT_CLASS = {"success": "success", "accent": "info", "warning": "warning", "error": "error"}  # .state-dot colors

STATUS = {  # state: (words, style class)
    State.CONNECTED: ("Connected", "success"),
    State.ERROR: ("Error", "error"),
    State.DISCONNECTED: ("Not connected", "dim-label"),
}


def _label(text: str = "", *classes: str, xalign: float = 0) -> Gtk.Label:
    label = Gtk.Label(label=text, xalign=xalign, wrap=True, wrap_mode=Pango.WrapMode.WORD_CHAR)
    for c in classes:
        label.add_css_class(c)
    return label


def _open_button(label: str, icon: str) -> Gtk.Button:
    return Gtk.Button(child=Adw.ButtonContent(label=label, icon_name=icon), css_classes=["open-action"])


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
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        self.session = session
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect
        self.save = save
        self.add_css_class("card")
        self.add_css_class("cluster-card")

        head = Gtk.Box(spacing=12)
        head.append(Gtk.Image(icon_name="network-server-symbolic", pixel_size=20, valign=Gtk.Align.CENTER,
                              css_classes=["icon-tile"]))
        titles = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True, valign=Gtk.Align.CENTER)
        self.title = _label("", "title-4")
        self.subtitle = _label("", "dim-label", "caption")
        titles.append(self.title)
        titles.append(self.subtitle)
        head.append(titles)

        self.status = Gtk.Box(spacing=6, valign=Gtk.Align.CENTER)
        self.dot = Gtk.Box(css_classes=["state-dot"], valign=Gtk.Align.CENTER)  # a real dot, colored in style.py
        self.status_text = Gtk.Label(css_classes=["caption-heading"])
        self.status.append(self.dot)
        self.status.append(self.status_text)
        head.append(self.status)

        phone = Gtk.Button(icon_name="phone-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                           tooltip_text="Connect phone: a QR code with this login for HPC Hub on your phone")
        phone.connect("clicked", lambda *_: PhonePairDialog([session], at_once=True).present(self))
        gear = Gtk.Button(icon_name="emblem-system-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                          tooltip_text=f"{session.cfg.name} settings")
        gear.connect("clicked", lambda *_: on_settings(session))
        head.append(phone)
        head.append(gear)

        actions = Gio.SimpleActionGroup()
        for name, fn in (("release-node", self._release_node), ("get-node", self._node_dialog),
                         ("fast-node", lambda: session.request_fast_node()),
                         ("vpn-only", lambda: on_connect(session, True)),
                         ("disconnect", lambda: on_disconnect(session))):
            a = Gio.SimpleAction.new(name, None)
            a.connect("activate", lambda *_, f=fn: f())
            actions.add_action(a)
        self.insert_action_group("card", actions)
        self.more = Gtk.MenuButton(icon_name="view-more-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                                   tooltip_text="More")
        head.append(self.more)
        self.append(head)

        status = Gtk.Box(spacing=8)
        self.spinner = Adw.Spinner()
        status.append(self.spinner)
        self.detail = _label("")
        self.detail.set_hexpand(True)
        status.append(self.detail)
        self.status_row = status
        self.append(status)

        # connected: where you are, then what you open
        node_row = Gtk.Box(spacing=8, css_classes=["node-well"])
        node_row.append(Gtk.Image(icon_name="computer-symbolic", css_classes=["dim-label"]))
        self.node = _label("")
        self.node.set_selectable(True)
        node_row.append(self.node)
        self.get_one = Gtk.Button(label="Get one", css_classes=["flat", "accent"], valign=Gtk.Align.CENTER)
        self.get_one.connect("clicked", lambda *_: self._node_dialog())
        node_row.append(self.get_one)
        self.node_row = node_row
        self.append(node_row)

        self.open_row = Gtk.Box(spacing=8)
        for label, icon, key in (("Terminal", "utilities-terminal-symbolic", "terminal"),
                                 ("VS Code", "text-editor-symbolic", "vscode"),
                                 ("Files", "folder-symbolic", "files")):
            b = _open_button(label, icon)
            b.connect("clicked", lambda *_, k=key: on_tool(session, k))
            self.open_row.append(b)
        agents = Gio.Menu()
        for a in AGENTS:
            agents.append(a.name, f"card.agent::{a.id}")
        agents.append("Ask all agents", "card.ask")
        pick = Gio.SimpleAction.new("agent", GLib.VariantType.new("s"))
        pick.connect("activate", lambda _a, v: on_tool(session, f"agent:{v.get_string()}"))
        actions.add_action(pick)
        ask = Gio.SimpleAction.new("ask", None)
        ask.connect("activate", lambda *_: on_tool(session, "ask"))
        actions.add_action(ask)
        # a plain button that opens the menu, so it looks exactly like its neighbours
        who = _open_button("Agents", "system-users-symbolic")
        inner = Gtk.Box(spacing=6)
        inner.append(Adw.ButtonContent(label="Agents", icon_name="system-users-symbolic"))
        inner.append(Gtk.Image(icon_name="pan-down-symbolic", css_classes=["dim-label"]))
        who.set_child(inner)
        pop = Gtk.PopoverMenu.new_from_model(agents)
        pop.set_parent(who)
        who.connect("clicked", lambda *_: pop.popup())
        self.open_row.append(who)
        self.append(self.open_row)

        # not connected: the node it asks for, and the next thing to do
        bottom = Gtk.Box(spacing=12)
        self.want_node = Gtk.CheckButton(active=session.cfg.request_node_on_connect, hexpand=True,
                                         tooltip_text="Ask Slurm for a compute node when you connect")
        self.want_node.connect("toggled", self._on_want_node)
        bottom.append(self.want_node)
        self.action = Gtk.Button(valign=Gtk.Align.CENTER, halign=Gtk.Align.END, hexpand=True,
                                 css_classes=["pill"])
        self.action.connect("clicked", self._on_action)
        bottom.append(self.action)
        self.bottom = bottom
        self.append(bottom)

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

    def _node_dialog(self) -> None:
        s = self.session

        def go(profile, remember):
            if remember:
                s.cfg.profile = profile
                self.save()
            s.request_node(profile)
        ComputeDialog(f"Compute node on {s.cfg.name}", s, s.cfg.profile, go, go_label="Request").present(self)

    def _release_node(self) -> None:
        """Your own node: ask first, since whatever runs there stops. Someone else's: just stop using it."""
        s, a = self.session, self.session.allocation
        if not a or not a.owned:
            s.release_node()
            return
        dialog = Adw.AlertDialog(heading=f"Release node {a.node}?", prefer_wide_layout=True,
                                 body=f"Job {a.job_id} ends and the node goes back to the cluster. Anything running "
                                      "there stops.\n\nYou stay connected, and your files stay where they are.")
        dialog.add_response("keep", "Keep it")
        dialog.add_response("release", "Release node")
        dialog.set_response_appearance("release", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.set_default_response("keep")
        dialog.set_close_response("keep")
        dialog.connect("response", lambda _d, r: s.release_node() if r == "release" else None)
        dialog.present(self)

    def _on_action(self, *_):
        state = self.session.state
        if state.busy:
            self.session.cancel()
        elif state == State.CONNECTED:
            self.on_disconnect(self.session)  # VPN only: the one thing left to do
        else:
            self.on_connect(self.session)

    def _menu(self) -> Gio.Menu | None:
        """The ⋮ menu for this state, or None when it would be empty."""
        s, cfg = self.session, self.session.cfg
        menu = Gio.Menu()
        if s.connected:
            node = Gio.Menu()
            a = s.allocation
            if a:
                node.append("Release node…" if a.owned else "Stop using this node", "card.release-node")
            else:
                node.append("Get a node…", "card.get-node")
                if cfg.fast_profile():
                    node.append(cfg.fast_label(), "card.fast-node")
            menu.append_section(None, node)
        if cfg.vpn.enabled and s.state in (State.DISCONNECTED, State.ERROR):
            menu.append("Connect the VPN only", "card.vpn-only")
        if s.state == State.CONNECTED:
            menu.append_section(None, Gio.Menu.new())
            menu.append("Disconnect", "card.disconnect")
        return menu if menu.get_n_items() else None

    def refresh(self) -> None:
        s, cfg = self.session, self.session.cfg
        idle = s.state in (State.DISCONNECTED, State.ERROR)
        vpn_only = s.state == State.CONNECTED and not s.connected
        self.title.set_label(cfg.name)
        self.subtitle.set_label((cfg.host or "No host set") + (f" · {cfg.who} VPN" if cfg.vpn.enabled else ""))
        asks = ", asks first" if cfg.ask_node else ""
        self.want_node.set_label(f"Get a compute node · {cfg.profile.summary()}{asks}")
        if s.pick_node and not self._asked:
            self._asked = True
            self._node_dialog()
        self._asked = self._asked and s.pick_node
        self.want_node.set_active(cfg.request_node_on_connect)

        words, tone = STATUS.get(s.state, ("Approve Duo" if s.state == State.DUO else s.state.value, ""))
        tone = tone or TEXT_CLASS[kind_for(s.state.value)]  # in progress is blue, waiting on you is amber
        if vpn_only:
            words = "VPN only"
        self.status_text.set_label(words)
        for c in set(TEXT_CLASS.values()):
            self.status_text.remove_css_class(c)
        self.status_text.add_css_class(tone)
        for c in DOT_CLASS.values():
            self.dot.remove_css_class(c)
        if DOT_CLASS.get(tone):
            self.dot.add_css_class(DOT_CLASS[tone])

        self.spinner.set_visible(s.state.busy)
        self.detail.set_label(s.detail)
        self.status_row.set_visible(s.state.busy or (bool(s.detail) and not vpn_only))
        for c in ("accent", "error"):
            self.detail.remove_css_class(c)
        if s.state == State.DUO:
            self.detail.add_css_class("accent")
        elif s.state == State.ERROR:
            self.detail.add_css_class("error")

        a = s.allocation
        self.node_row.set_visible(s.connected)
        self.open_row.set_visible(s.connected)
        self.get_one.set_visible(s.connected and not a)
        if a:
            self.node.set_markup(f"On node <b>{a.node}</b> <span alpha='70%'>· job {a.job_id}"
                                 + ("" if a.owned else ", started elsewhere") + "</span>")
        else:
            self.node.set_markup("<span alpha='70%'>No compute node</span>")
        self.more.set_menu_model(self._menu())
        self.more.set_visible(self.more.get_menu_model() is not None)

        self.bottom.set_visible(idle or s.state.busy or vpn_only)
        self.want_node.set_visible(idle)
        for c in ("suggested-action", "flat"):
            self.action.remove_css_class(c)
        self.action.set_sensitive(s.state != State.DISCONNECTING)
        if s.state == State.DISCONNECTING:
            self.action.set_label("Disconnecting…")
        elif s.state.busy:
            self.action.set_label("Cancel")
        elif vpn_only:
            self.action.set_label("Disconnect")
        else:
            self.action.set_label("Try again" if s.state == State.ERROR else "Connect")
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
