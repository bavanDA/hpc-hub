"""TerminalsPage: the activity bar and panels on the left, the open terminal on the right."""

import shlex
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk, Pango

from ... import links, tmux
from ...core import remote
from ...links import Link
from ...session import ClusterSession
from ..widgets import bg, color_dot, open_uri, remember_size
from .new_terminal import NewTerminalDialog
from .session_list import SessionListMixin
from .session_menu import SessionMenuMixin
from .terminal_tab import TerminalTab, View

REFRESH_SECONDS = 15


class TerminalsPage(SessionListMixin, SessionMenuMixin, Gtk.Box):
    """The session list works like tabs: click one to open it on the right. Switching away detaches it,
    and it keeps running in tmux on the cluster. VS Code logs stay open until you close them."""

    def __init__(self, sessions: list[ClusterSession] | None = None, toast: Callable[[str], None] = lambda t: None):
        super().__init__(orientation=Gtk.Orientation.HORIZONTAL)
        self.sessions = sessions or []
        self.toast = toast
        self.current: View | None = None
        self.logs: list[View] = []
        self.listings: dict[str, tmux.Listing] = {}
        self.starting: dict[tuple[str, str], tuple[str, str]] = {}  # just created, not listed yet: title, color
        self.remote_checked: dict[tuple[str, str], float] = {}  # when we last looked for a remote link

        self.on_tool: Callable[[ClusterSession, str], None] | None = None  # set by the app: VS Code, agents

        # far left: tabs that open and close the panels
        bar = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, css_classes=["activity-bar"])
        self.tabs: dict[str, Gtk.ToggleButton] = {}
        self.logs_badge = Gtk.Label(css_classes=["activity-badge"], halign=Gtk.Align.END, valign=Gtk.Align.END,
                                    visible=False, can_target=False)
        for name, label, icon in (("sessions", "Sessions", "utilities-terminal-symbolic"),
                                  ("logs", "Logs", "text-x-generic-symbolic"),
                                  ("new", "New", "list-add-symbolic")):
            content = Gtk.Overlay(child=Gtk.Image(icon_name=icon, pixel_size=22))
            if name == "logs":
                content.add_overlay(self.logs_badge)
            b = Gtk.ToggleButton(child=content, css_classes=["activity-tab"], tooltip_text=label)
            b.connect("toggled", self._tab_toggled, name)
            bar.append(b)
            self.tabs[name] = b
        self.append(bar)
        self.append(Gtk.Separator(orientation=Gtk.Orientation.VERTICAL))

        self.panels = Gtk.Stack(width_request=200, transition_type=Gtk.StackTransitionType.CROSSFADE)
        self.panels.add_named(self._sessions_panel(), "sessions")
        self.panels.add_named(self._logs_panel(), "logs")
        self.panels.add_named(self._new_panel(), "new")
        self.panels.set_visible(False)

        # right: a small header for the open session, then the terminal
        right = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        self.header = Gtk.Box(spacing=8, margin_top=6, margin_bottom=6, margin_start=10, margin_end=6)
        self.dot = Gtk.Box(valign=Gtk.Align.CENTER)
        self.title = Gtk.Label(xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.END, css_classes=["heading"])
        self.header.append(self.dot)
        self.header.append(self.title)
        self.remote_btn = Gtk.Button(css_classes=["suggested-action"], visible=False, valign=Gtk.Align.CENTER)
        self.remote_btn.connect("clicked", lambda *_: self._use_remote())
        self.header.append(self.remote_btn)
        self.remote_box = Gtk.Box(spacing=6, valign=Gtk.Align.CENTER, visible=False,
                                  tooltip_text="Remote Control: use this Claude from claude.ai or the Claude app")
        self.remote_box.append(Gtk.Label(label="Remote", css_classes=["dim-label"]))
        self.remote_switch = Gtk.Switch(valign=Gtk.Align.CENTER)
        self.remote_switch.connect("state-set", self._remote_switched)
        self.remote_box.append(self.remote_switch)
        self.header.append(self.remote_box)
        self._switch_busy = False
        self.actions = Gtk.MenuButton(icon_name="view-more-symbolic", css_classes=["flat"], tooltip_text="Session")
        close = Gtk.Button(icon_name="window-close-symbolic", css_classes=["flat"], tooltip_text="Close (keeps running)")
        close.connect("clicked", lambda *_: self.close_current())
        self.header.append(self.actions)
        self.header.append(close)
        right.append(self.header)
        self.views = Gtk.Stack(vexpand=True, hexpand=True)
        self.empty = Adw.StatusPage(
            icon_name="utilities-terminal-symbolic", title="Nothing open",
            description="Click a session on the left, start a new terminal, or run VS Code, Claude, ChatGPT, "
                        "Antigravity or Cursor from a cluster card.")
        self.views.add_named(self.empty, "empty")
        right.append(self.views)
        self.append(remember_size(Gtk.Paned(start_child=self.panels, end_child=right, hexpand=True,
                                            resize_start_child=False, shrink_start_child=False,
                                            shrink_end_child=False), "terminals.panel", 290))

        self.connect("map", lambda *_: self.refresh())
        GLib.timeout_add_seconds(REFRESH_SECONDS, lambda: (self.get_mapped() and self.refresh(), True)[1])
        self._show(None)
        self.tabs["sessions"].set_active(True)

    # -- left tabs and panels ------------------------------------------------------------------
    def _tab_toggled(self, btn: Gtk.ToggleButton, name: str) -> None:
        if btn.get_active():
            for other, b in self.tabs.items():
                if other != name and b.get_active():
                    b.set_active(False)
            self.panels.set_visible_child_name(name)
            self.panels.set_visible(True)
        elif not any(b.get_active() for b in self.tabs.values()):
            self.panels.set_visible(False)  # clicked the open tab again: close the panel

    def _panel_head(self, title: str, *widgets: Gtk.Widget) -> Gtk.Box:
        head = Gtk.Box(spacing=6, margin_top=8, margin_bottom=8, margin_start=10, margin_end=8)
        head.append(Gtk.Label(label=title, xalign=0, hexpand=True, css_classes=["heading"]))
        for w in widgets:
            head.append(w)
        return head

    def _sessions_panel(self) -> Gtk.Widget:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh", css_classes=["flat"])
        refresh.connect("clicked", lambda *_: self.refresh())
        new = Gtk.Button(icon_name="list-add-symbolic", tooltip_text="New terminal", css_classes=["flat"])
        new.connect("clicked", lambda *_: self.new_terminal())
        box.append(self._panel_head("Sessions", refresh, new))
        self.list = Gtk.ListBox(css_classes=["navigation-sidebar"], selection_mode=Gtk.SelectionMode.SINGLE)
        self.list.connect("row-activated", lambda _l, row: getattr(row, "open", None) and row.open())
        box.append(Gtk.ScrolledWindow(child=self.list, vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER))
        box.append(Gtk.Label(label="Switching or closing only detaches. Sessions keep running on the cluster.\n"
                                   "Select text with the mouse to copy it. Paste: Ctrl+Shift+V or right click.",
                             wrap=True, xalign=0, css_classes=["dim-label", "caption"], margin_start=10,
                             margin_end=10, margin_bottom=10))
        return box

    def _logs_panel(self) -> Gtk.Widget:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(self._panel_head("Logs"))
        self.log_list = Gtk.ListBox(css_classes=["navigation-sidebar"], selection_mode=Gtk.SelectionMode.SINGLE)
        self.log_list.connect("row-activated", lambda _l, row: getattr(row, "open", None) and row.open())
        self.log_list.set_placeholder(Gtk.Label(label="VS Code job logs show up here.", wrap=True, margin_top=12,
                                                margin_start=10, margin_end=10, css_classes=["dim-label"]))
        box.append(Gtk.ScrolledWindow(child=self.log_list, vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER))
        return box

    def _new_panel(self) -> Gtk.Widget:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        box.append(self._panel_head("New"))
        term = Gtk.Button(child=Adw.ButtonContent(label="New terminal…", icon_name="utilities-terminal-symbolic"),
                          css_classes=["suggested-action"], margin_start=10, margin_end=10)
        term.connect("clicked", lambda *_: self.new_terminal())
        box.append(term)
        self.launch = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin_start=10, margin_end=10)
        box.append(Gtk.ScrolledWindow(child=self.launch, vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER))
        return box

    def _fill_launch(self) -> None:
        while c := self.launch.get_first_child():
            self.launch.remove(c)
        live = [s for s in self.sessions if s.connected]
        if not live:
            self.launch.append(Gtk.Label(label="Connect a cluster to start VS Code or an agent here.", wrap=True,
                                         xalign=0, css_classes=["dim-label"], margin_top=12))
        for s in live:
            self.launch.append(Gtk.Label(label=s.cfg.name, xalign=0, css_classes=["heading"], margin_top=12))
            for tool, label, icon in (("vscode:", "VS Code", "text-editor-symbolic"),
                                      ("agent:claude", "Claude", "hpc-claude"),
                                      ("agent:codex", "ChatGPT", "hpc-openai-symbolic"),
                                      ("agent:agy", "Antigravity", "hpc-antigravity"),
                                      ("agent:cursor", "Cursor", "hpc-cursor-symbolic"),
                                      ("ask", "Ask all", "system-users-symbolic")):
                content = Gtk.Box(spacing=8)
                content.append(Gtk.Image(icon_name=icon))
                content.append(Gtk.Label(label=label))
                b = Gtk.Button(child=content, css_classes=["flat"])
                b.connect("clicked", lambda *_, s=s, t=tool: self.on_tool and self.on_tool(s, t))
                self.launch.append(b)

    # -- right side --------------------------------------------------------------------------
    def _show(self, view: View | None) -> None:
        """Make view the visible one. A tmux view we leave is detached (its ssh closes)."""
        old = self.current
        if old and old is not view and old not in self.logs:
            old.tab.kill()
            self.views.remove(old.tab)
        self.current = view
        self.header.set_visible(view is not None)
        if not view:
            self.views.set_visible_child_name("empty")
            self._select()
            return
        if view.tab.get_parent() is None:
            self.views.add_child(view.tab)
        self.views.set_visible_child(view.tab)
        self._header(view)
        view.tab.term.grab_focus()
        self._select()

    def _header(self, view: View) -> None:
        while c := self.dot.get_first_child():
            self.dot.remove(c)
        self.dot.append(color_dot(view.color) if view.color else Gtk.Image(icon_name=view.icon))
        self.title.set_label(view.title)
        self._remote_button(view.tab)
        t = view.tmux_session
        claude = bool(view.session and t and t.agent == "claude" and t.kind == "tmux")
        self.remote_box.set_visible(claude)
        if claude:
            self._switch_busy = True
            self.remote_switch.set_active(bool(t.remote) or view.tab.remote is not None)
            self._switch_busy = False
        if view.session and view.tmux_session:
            self.actions.set_popover(self._menu(view.session, view.tmux_session))
            self.actions.set_visible(True)
        else:
            self.actions.set_visible(False)

    def _remote_button(self, tab: TerminalTab) -> None:
        link = tab.remote
        self.remote_btn.set_visible(link is not None)
        if link and link.kind == links.PAIR:
            self.remote_btn.set_label(f"Copy pairing code {link.code}")
            self.remote_btn.set_tooltip_text("In the ChatGPT app: Codex, connect a machine, enter this code")
        elif link:
            self.remote_btn.set_label("Open remote")
            self.remote_btn.set_tooltip_text(link.url)

    def _remote_switched(self, _switch, want: bool) -> bool:
        """Turn Remote Control on or off in the open Claude session."""
        v = self.current
        if self._switch_busy or not (v and v.session and v.tmux_session):
            return False
        s, t = v.session, v.tmux_session
        self.toast(f"Turning Remote Control {'on' if want else 'off'}…")
        if not want:
            v.tab.remote = None
            self._remote_button(v.tab)

        def done(_r, err):
            if err:
                self.toast(f"Remote Control: {err}")
            self.remote_checked.pop((s.cfg.id, t.name), None)  # look again soon
            GLib.timeout_add_seconds(5, lambda: self.refresh() and False)
        bg(lambda: tmux.set_remote_control(s.ssh, t, want), done)
        return False

    def _use_remote(self) -> None:
        link = self.current.tab.remote if self.current else None
        if not link:
            return
        if link.kind == links.PAIR:
            self.get_clipboard().set(link.code)
            self.toast(f"Pairing code {link.code} copied")
        else:
            open_uri(self, link.url)

    def close_current(self) -> None:
        view = self.current
        if not view:
            return
        if view in self.logs:
            self.logs.remove(view)
            view.tab.kill()
            self.views.remove(view.tab)
            self.current = None
        self._show(None)
        self._fill()

    def open(self, title: str, argv: list[str], icon: str, node: str = "",
             on_link: Callable[[TerminalTab, Link], None] | None = None, key: tuple[str, str] | None = None,
             color: str = "") -> TerminalTab:
        """key = (cluster id, tmux session) for sessions; no key = a log that stays open until closed."""
        if key and self.current and self.current.key == key:
            return self.current.tab
        tab = TerminalTab(argv, node, on_link)
        tab.toast = self.toast
        tab.on_remote = lambda t: self.current and self.current.tab is t and self._remote_button(t)
        if key:
            s = next((x for x in self.sessions if x.cfg.id == key[0]), None)
            listed = self._listed(key)
            view = View(key, tab, title, color, icon, s, listed or tmux.Session(key[1], label=title, color=color))
            if s and s.ssh:
                where = (listed.node if listed else node)
                tab.tmux_buffer = lambda ssh=s.ssh: ssh.run(tmux.save_buffer(where), timeout=15).stdout
            if listed and listed.remote:  # known from before: the header button works right away
                code = listed.remote.startswith("code:")
                tab.remote = Link(links.PAIR, "", code=listed.remote[5:]) if code else Link(links.REMOTE, listed.remote)
            tab.on_remote = lambda t, v=view: (self._remember_remote(v, t.remote),
                                               self.current and self.current.tab is t and self._remote_button(t))
            if not listed:
                self.starting[key] = (title, color)
                GLib.timeout_add(2000, lambda: self.refresh() and False)
        else:
            view = View(("log", str(id(tab))), tab, title, color, icon)
            self.logs.append(view)
        self._show(view)
        self._fill()
        return tab

    def attach(self, s: ClusterSession, t: tmux.Session) -> None:
        self.open(t.title, s.ssh.argv(tmux.attach(t), tty=True), "utilities-terminal-symbolic", node=t.node,
                  key=(s.cfg.id, t.name), color=t.color or tmux.AGENT_COLORS.get(t.agent, ""))

    def _listed(self, key: tuple[str, str]) -> tmux.Session | None:
        listing = self.listings.get(key[0])
        return next((t for t in listing.sessions if t.name == key[1]), None) if listing else None

    def new_terminal(self) -> None:
        live = [s for s in self.sessions if s.connected]
        if not live:
            self.toast("Connect a cluster first")
            return
        NewTerminalDialog(live, self._create).present(self.get_root())

    def _create(self, s: ClusterSession, on_node: bool, label: str, color: str, folder: str) -> None:
        name = f"hpchub-term-{time.strftime('%m%d-%H%M%S')}"
        a = s.allocation
        node = a.node if on_node and a else ""
        cmd = f"bash -c {shlex.quote(remote.cd_part(folder) + '; exec bash -l')}"
        line = tmux.open_line(name, cmd, label, color, node=node)
        self.open(label, s.ssh.argv(line, tty=True), "utilities-terminal-symbolic", node=node,
                  key=(s.cfg.id, name), color=color)
