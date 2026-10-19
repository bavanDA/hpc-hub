"""Terminals tab: your tmux sessions on each cluster, plus open tabs with link banners."""

import os
import shlex
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

import gi

gi.require_version("Vte", "3.91")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, Pango, Vte  # noqa: E402

from .. import links, remote, tmux  # noqa: E402
from ..links import Link  # noqa: E402
from ..session import ClusterSession, State  # noqa: E402
from .widgets import open_uri, remember_size  # noqa: E402


class TerminalTab(Gtk.Box):
    def __init__(self, argv: list[str], node: str = "", on_link: Callable[["TerminalTab", Link], None] | None = None,
                 on_exit: Callable[["TerminalTab"], None] | None = None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.node = node
        self.on_link = on_link
        self.on_exit = on_exit
        self.seen: set[str] = set()
        self.banners = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.append(self.banners)

        self.remote: Link | None = None  # remote control link or pairing code the session printed
        self.on_remote: Callable[["TerminalTab"], None] | None = None
        self.toast: Callable[[str], None] = lambda text: None
        self.tmux_buffer: Callable[[], str] | None = None  # reads tmux's copy buffer (mouse drag in tmux)

        self.term = Vte.Terminal(vexpand=True, hexpand=True, scrollback_lines=20000)
        self.term.set_font(Pango.FontDescription.from_string("Monospace 11"))
        self.term.connect("contents-changed", self._changed)
        self.term.connect("child-exited", self._exited)
        self.term.connect("selection-changed", self._selected)
        self._clipboard_keys()
        self._clipboard_mouse()
        self.append(self.term)
        self._scan_pending = False

        env = [f"{k}={v}" for k, v in os.environ.items()] + ["TERM=xterm-256color"]
        self.term.spawn_async(Vte.PtyFlags.DEFAULT, None, argv, env, GLib.SpawnFlags.SEARCH_PATH,
                              None, None, -1, None, None)

    # -- copy and paste ------------------------------------------------------------------
    def _clipboard_keys(self) -> None:
        """Ctrl+Shift+C / Ctrl+Shift+V, and Ctrl+C copies when text is selected (else it interrupts)."""
        keys = Gtk.EventControllerKey(propagation_phase=Gtk.PropagationPhase.CAPTURE)

        def pressed(_c, keyval, _code, state):
            ctrl = state & Gdk.ModifierType.CONTROL_MASK
            shift = state & Gdk.ModifierType.SHIFT_MASK
            key = Gdk.keyval_to_lower(keyval)
            if ctrl and shift and key == Gdk.KEY_c or ctrl and key == Gdk.KEY_c and self.term.get_has_selection():
                self.copy()
                return True
            if ctrl and shift and key == Gdk.KEY_v:
                self.term.paste_clipboard()
                return True
            return False
        keys.connect("key-pressed", pressed)
        self.term.add_controller(keys)

    def _clipboard_mouse(self) -> None:
        """Right click: our Copy/Paste menu. A drag inside tmux (mouse on) copies through tmux's buffer."""
        menu = Gio.Menu()
        menu.append("Copy", "term.copy")
        menu.append("Paste", "term.paste")
        menu.append("Select all", "term.select-all")
        group = Gio.SimpleActionGroup()
        for name, fn in (("copy", self.copy), ("paste", self.term.paste_clipboard),
                         ("select-all", self.term.select_all)):
            act = Gio.SimpleAction(name=name)
            act.connect("activate", lambda *_, f=fn: f())
            group.add_action(act)
        self.insert_action_group("term", group)
        self.menu = Gtk.PopoverMenu(menu_model=menu, has_arrow=False, halign=Gtk.Align.START)
        self.menu.set_parent(self.term)

        right = Gtk.GestureClick(button=3, propagation_phase=Gtk.PropagationPhase.CAPTURE)

        def on_right(g, _n, x, y):
            g.set_state(Gtk.EventSequenceState.CLAIMED)  # don't let tmux open its own menu
            rect = Gdk.Rectangle()
            rect.x, rect.y, rect.width, rect.height = int(x), int(y), 1, 1
            self.menu.set_pointing_to(rect)
            self.menu.popup()
        right.connect("pressed", on_right)
        self.term.add_controller(right)

        drag = Gtk.GestureDrag(button=1, propagation_phase=Gtk.PropagationPhase.CAPTURE)

        def on_end(g, dx, dy):
            shift = g.get_current_event_state() & Gdk.ModifierType.SHIFT_MASK
            if self.tmux_buffer and not shift and abs(dx) + abs(dy) > 6:
                GLib.timeout_add(250, lambda: self._copy_tmux() and False)
        drag.connect("drag-end", on_end)
        self.term.add_controller(drag)

    def copy(self) -> None:
        if self.term.get_has_selection():
            self.term.copy_clipboard_format(Vte.Format.TEXT)
            self.toast("Copied")
        elif self.tmux_buffer:
            self._copy_tmux()

    def _selected(self, *_):
        if self.term.get_has_selection():  # Shift+drag selects here: copy right away, like most terminals
            self.term.copy_clipboard_format(Vte.Format.TEXT)

    def _copy_tmux(self) -> None:
        fetch = self.tmux_buffer

        def done(text, err):
            if text:
                self.get_clipboard().set(text.rstrip("\n"))
                self.toast("Copied")
        _bg(lambda: fetch() if fetch else "", done)

    def _changed(self, *_):
        if not self._scan_pending:
            self._scan_pending = True
            GLib.timeout_add(700, self._scan)

    def _scan(self) -> bool:
        self._scan_pending = False
        text = self.term.get_text_format(Vte.Format.TEXT)
        for link in links.find_links(text or "", self.node):
            key = link.url + link.code
            if key not in self.seen:
                self.seen.add(key)
                if link.kind in (links.REMOTE, links.PAIR):
                    self.remote = link
                    if self.on_remote:
                        self.on_remote(self)
                if self.on_link:
                    self.on_link(self, link)
        return False

    def _exited(self, *_):
        self.add_banner("Session ended. Close this tab, or open it again from the cluster card.")
        if self.on_exit:
            self.on_exit(self)

    def add_banner(self, title: str, button: str = "", on_click: Callable[[], None] | None = None) -> None:
        bar = Adw.Banner(title=title, revealed=True, use_markup=False)
        if button:
            bar.set_button_label(button)
            bar.connect("button-clicked", lambda *_: on_click and on_click())
        self.banners.append(bar)

    def kill(self) -> None:
        pty = self.term.get_pty()
        if pty:
            pty.close()


def color_dot(color: str, size: int = 12) -> Gtk.DrawingArea:
    rgba = Gdk.RGBA()
    rgba.parse(color or "#77767b")

    def draw(_a, cr, w, h):
        cr.set_source_rgba(rgba.red, rgba.green, rgba.blue, rgba.alpha)
        cr.arc(w / 2, h / 2, min(w, h) / 2, 0, 6.2832)
        cr.fill()
    area = Gtk.DrawingArea(content_width=size, content_height=size, valign=Gtk.Align.CENTER)
    area.set_draw_func(draw)
    return area


def _bg(work, done) -> None:
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


def _ago(ts: int) -> str:
    if not ts:
        return ""
    m = int(max(0, time.time() - ts) // 60)
    return f"{m} min" if m < 60 else f"{m // 60} h" if m < 48 * 60 else f"{m // 1440} days"


AGENT_NAMES = {"claude": "Claude", "codex": "ChatGPT", "agy": "Antigravity", "term": "Terminal"}
REFRESH_SECONDS = 15


@dataclass
class View:
    """What the right side shows: an attached tmux session, or a log (VS Code job)."""
    key: tuple[str, str]
    tab: TerminalTab
    title: str
    color: str = ""
    icon: str = "utilities-terminal-symbolic"
    session: ClusterSession | None = None  # set for tmux views
    tmux_session: tmux.Session | None = None


class TerminalsPage(Gtk.Box):
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

        self.on_tool: Callable[[ClusterSession, str], None] | None = None  # set by the app: VS Code, agents

        # far left: tabs. Click one to open its panel, click it again to close the panel.
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
        self.panel = self.panels
        self.panel.set_visible(False)

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
        self.actions = Gtk.MenuButton(icon_name="view-more-symbolic", css_classes=["flat"], tooltip_text="Session")
        close = Gtk.Button(icon_name="window-close-symbolic", css_classes=["flat"], tooltip_text="Close (keeps running)")
        close.connect("clicked", lambda *_: self.close_current())
        self.header.append(self.actions)
        self.header.append(close)
        right.append(self.header)
        self.views = Gtk.Stack(vexpand=True, hexpand=True)
        self.empty = Adw.StatusPage(
            icon_name="utilities-terminal-symbolic", title="Nothing open",
            description="Click a session on the left, start a new terminal, or run VS Code, Claude, ChatGPT or "
                        "Antigravity from a cluster card.")
        self.views.add_named(self.empty, "empty")
        right.append(self.views)
        # drag the line between the panel and the terminal to make the panel wider or narrower
        self.append(remember_size(Gtk.Paned(start_child=self.panel, end_child=right, hexpand=True,
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
            self.panel.set_visible(True)
        elif not any(b.get_active() for b in self.tabs.values()):
            self.panel.set_visible(False)  # clicked the open tab again: close the panel

    def show_tab(self, name: str) -> None:
        self.tabs[name].set_active(True)

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
        live = [s for s in self.sessions if s.state == State.CONNECTED and s.ssh]
        if not live:
            self.launch.append(Gtk.Label(label="Connect a cluster to start VS Code or an agent here.", wrap=True,
                                         xalign=0, css_classes=["dim-label"], margin_top=12))
        for s in live:
            self.launch.append(Gtk.Label(label=s.cfg.name, xalign=0, css_classes=["heading"], margin_top=12))
            for tool, label, icon in (("vscode:", "VS Code", "text-editor-symbolic"),
                                      ("agent:claude", "Claude", "hpc-claude"),
                                      ("agent:codex", "ChatGPT", "hpc-openai-symbolic"),
                                      ("agent:agy", "Antigravity", "hpc-antigravity")):
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
                tab.tmux_buffer = lambda ssh=s.ssh: ssh.run("tmux save-buffer - 2>/dev/null", timeout=15).stdout
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
        self.open(t.title, s.ssh.argv(tmux.attach(t), tty=True), "utilities-terminal-symbolic",
                  key=(s.cfg.id, t.name), color=t.color or tmux.AGENT_COLORS.get(t.agent, ""))

    def _listed(self, key: tuple[str, str]) -> tmux.Session | None:
        listing = self.listings.get(key[0])
        return next((t for t in listing.sessions if t.name == key[1]), None) if listing else None

    # -- session list ------------------------------------------------------------------------------
    def refresh(self) -> None:
        live = [s for s in self.sessions if s.state == State.CONNECTED and s.ssh]
        for s in self.sessions:
            if s not in live:
                self.listings.pop(s.cfg.id, None)
        self._fill()
        for s in live:
            _bg(lambda s=s: tmux.list_sessions(s.ssh), lambda listing, err, s=s: self._listed_in(s, listing))

    def _listed_in(self, s: ClusterSession, listing: tmux.Listing | None) -> None:
        if not listing:
            return
        self.listings[s.cfg.id] = listing
        for t in listing.sessions:
            self.starting.pop((s.cfg.id, t.name), None)
        if self.current and self.current.session is s:  # keep the header in step with renames
            t = self._listed(self.current.key)
            if t:
                self.current.tmux_session, self.current.title = t, t.title
                self.current.color = t.color or tmux.AGENT_COLORS.get(t.agent, "") or self.current.color
                self._header(self.current)
        self._fill()

    def _fill(self) -> None:
        self.list.remove_all()
        self.log_list.remove_all()
        for v in self.logs:
            self.log_list.append(self._log_row(v))
        self.logs_badge.set_label(str(len(self.logs)))
        self.logs_badge.set_visible(bool(self.logs))
        self._fill_launch()
        live = [s for s in self.sessions if s.state == State.CONNECTED and s.ssh]
        if not live:
            self.list.append(self._note("Connect a cluster to see its sessions."))
        for s in live:
            listing = self.listings.get(s.cfg.id)
            head = self._note(s.cfg.name, heading=True)
            if listing and listing.host:  # tmux lives on the login node, the programs on compute nodes
                head.set_tooltip_text(f"Sessions are kept by tmux on {listing.host}, so they survive closing the "
                                      "app. Each row shows the compute node its program runs on.")
            self.list.append(head)
            items = list(listing.sessions) if listing else []
            for (cid, name), (title, color) in self.starting.items():
                if cid == s.cfg.id and not any(t.name == name for t in items):
                    items.insert(0, tmux.Session(name, created=int(time.time()), label=title, color=color))
            if listing is None and not items:
                self.list.append(self._note("Loading…"))
            elif listing and not listing.has_tmux and not items:
                self.list.append(self._note("tmux is not installed here."))
            elif not items:
                self.list.append(self._note("No sessions yet."))
            for t in items:
                self.list.append(self._row(s, t, listing.nodes if listing else None))
        self._select()

    def _select(self) -> None:
        key = self.current.key if self.current else None
        for lst in (self.list, self.log_list):
            lst.unselect_all()
            row = lst.get_first_child()
            while row:
                if key and getattr(row, "key", None) == key:
                    lst.select_row(row)
                row = row.get_next_sibling()

    def _note(self, text: str, heading: bool = False) -> Gtk.ListBoxRow:
        row = Gtk.ListBoxRow(activatable=False, selectable=False)
        row.set_child(Gtk.Label(label=text, xalign=0, wrap=True, margin_start=6, margin_top=10 if heading else 2,
                                css_classes=["heading"] if heading else ["dim-label", "caption"]))
        return row

    def _log_row(self, v: View) -> Gtk.ListBoxRow:
        row = Gtk.ListBoxRow()
        box = Gtk.Box(spacing=8, margin_top=4, margin_bottom=4)
        box.append(Gtk.Image(icon_name=v.icon))
        box.append(Gtk.Label(label=v.title, xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.END))
        x = Gtk.Button(icon_name="window-close-symbolic", css_classes=["flat", "circular"], valign=Gtk.Align.CENTER,
                       tooltip_text="Close log")
        x.connect("clicked", lambda *_: (self._show(v), self.close_current()))
        box.append(x)
        row.set_child(box)
        row.key = v.key
        row.open = lambda: self._show(v)
        return row

    def _row(self, s: ClusterSession, t: tmux.Session, nodes: dict[str, str] | None = None) -> Gtk.ListBoxRow:
        row = Gtk.ListBoxRow()
        box = Gtk.Box(spacing=8, margin_top=4, margin_bottom=4)
        box.append(color_dot(t.color or tmux.AGENT_COLORS.get(t.agent, "")))
        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        text.append(Gtk.Label(label=t.title, xalign=0, ellipsize=Pango.EllipsizeMode.END))
        here = self.current is not None and self.current.key == (s.cfg.id, t.name)
        state = "open" if here else "in use elsewhere" if t.attached else "running"
        what = AGENT_NAMES.get(t.agent, "screen" if t.kind == "screen" else t.command or "tmux")
        if t.job and nodes is not None:
            node = nodes.get(t.job, "node ended")
            state = "" if node == "node ended" and state == "running" else state
        else:
            node = ""
        bits = [what, node, _ago(t.created), state]
        text.append(Gtk.Label(label=" · ".join(b for b in bits if b), xalign=0, ellipsize=Pango.EllipsizeMode.END,
                              css_classes=["dim-label", "caption"]))
        box.append(text)
        menu = Gtk.MenuButton(icon_name="view-more-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER)
        menu.set_popover(self._menu(s, t))
        box.append(menu)
        row.set_child(box)
        row.set_tooltip_text(f"{t.name} ({t.kind}){' in ' + t.path if t.path else ''}")
        row.key = (s.cfg.id, t.name)
        row.open = lambda: self.attach(s, t)
        return row

    def _menu(self, s: ClusterSession, t: tmux.Session) -> Gtk.Popover:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=4, margin_bottom=4,
                      margin_start=4, margin_end=4)
        pop = Gtk.Popover(child=box)
        b = Gtk.Button(label="Rename…", css_classes=["flat"])
        b.get_child().set_xalign(0)
        b.connect("clicked", lambda *_: (pop.popdown(), self.rename(s, t)))
        box.append(b)
        if t.kind == "tmux":
            colors = Gtk.Box(spacing=4, margin_top=4, margin_bottom=4, margin_start=6)
            for c in tmux.COLORS:
                b = Gtk.Button(child=color_dot(c, 14), css_classes=["flat", "circular"], tooltip_text=c)
                b.connect("clicked", lambda *_, c=c: (pop.popdown(), self._do(s, tmux.set_color(t, c), t, color=c)))
                colors.append(b)
            box.append(colors)
        stop = Gtk.Button(label="Stop session…", css_classes=["flat", "error"])
        stop.get_child().set_xalign(0)
        stop.connect("clicked", lambda *_: (pop.popdown(), self.stop(s, t)))
        box.append(stop)
        return pop

    def _do(self, s: ClusterSession, line: str, t: tmux.Session, color: str = "", title: str = "") -> None:
        key = (s.cfg.id, t.name)

        def done(_r, err):
            if err:
                self.toast(f"Failed: {err}")
            v = self.current
            if v and v.key == key:
                v.color, v.title = color or v.color, title or v.title
                self._header(v)
            self.refresh()
        _bg(lambda: tmux.run(s.ssh, line), done)

    def rename(self, s: ClusterSession, t: tmux.Session) -> None:
        d = Adw.AlertDialog(heading="Rename session", body=t.name)
        entry = Gtk.Entry(text=t.title, activates_default=True)
        d.set_extra_child(entry)
        d.add_response("cancel", "Cancel")
        d.add_response("ok", "Rename")
        d.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        d.set_default_response("ok")

        def on_response(_d, r):
            name = entry.get_text().strip()
            if r == "ok" and name:
                self._do(s, tmux.set_label(t, name), t, title=name)
        d.connect("response", on_response)
        d.present(self.get_root())

    def stop(self, s: ClusterSession, t: tmux.Session) -> None:
        d = Adw.AlertDialog(heading=f"Stop {t.title}?", body="Everything running in it ends (Claude, a build…).")
        d.add_response("cancel", "Cancel")
        d.add_response("stop", "Stop")
        d.set_response_appearance("stop", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_d, r):
            if r != "stop":
                return
            if self.current and self.current.key == (s.cfg.id, t.name):
                self._show(None)
            self._do(s, tmux.kill(t), t)
        d.connect("response", on_response)
        d.present(self.get_root())

    def new_terminal(self) -> None:
        live = [s for s in self.sessions if s.state == State.CONNECTED and s.ssh]
        if not live:
            self.toast("Connect a cluster first")
            return
        NewTerminalDialog(live, self._create).present(self.get_root())

    def _create(self, s: ClusterSession, on_node: bool, label: str, color: str, folder: str) -> None:
        name = f"hpchub-term-{time.strftime('%m%d-%H%M%S')}"
        a = s.allocation
        if on_node and a:
            cmd = remote.on_node(a.job_id, folder, ":")
        else:
            cmd = f"bash -c {shlex.quote(remote.cd_part(folder) + '; exec bash -l')}"
        line = tmux.open_line(name, cmd, label, color)
        self.open(label, s.ssh.argv(line, tty=True), "utilities-terminal-symbolic", node=a.node if on_node and a else "",
                  key=(s.cfg.id, name), color=color)


class NewTerminalDialog(Adw.Dialog):
    def __init__(self, live: list[ClusterSession], on_create):
        super().__init__(title="New terminal", content_width=480)
        self.live, self.on_create = live, on_create
        self.color = tmux.COLORS[0]
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(description="Runs in tmux, so it keeps going when you close the tab.")
        self.name = Adw.EntryRow(title="Name")
        self.name.set_text(f"Terminal {time.strftime('%H:%M')}")
        self.cluster = Adw.ComboRow(title="Cluster", model=Gtk.StringList.new([s.cfg.name for s in live]))
        self.where = Adw.ComboRow(title="Run on")
        self.folder = Adw.ActionRow(title="Start in", subtitle="~", activatable=True)
        pick = Gtk.Button(label="Choose…", valign=Gtk.Align.CENTER)
        pick.connect("clicked", lambda *_: self._browse())
        self.folder.connect("activated", lambda *_: self._browse())
        self.folder.add_suffix(pick)
        colors = Adw.ActionRow(title="Color")
        dots = Gtk.Box(spacing=2, valign=Gtk.Align.CENTER)
        self.color_btns = []
        for c in tmux.COLORS:
            b = Gtk.ToggleButton(child=color_dot(c, 16), css_classes=["flat", "circular"], active=c == self.color)
            b.connect("toggled", lambda btn, c=c: btn.get_active() and self._pick_color(c))
            dots.append(b)
            self.color_btns.append(b)
        colors.add_suffix(dots)
        for row in (self.name, self.cluster, self.where, self.folder, colors):
            group.add(row)
        page.add(group)
        self.cluster.connect("notify::selected", lambda *_: self._sync())
        create = Gtk.Button(label="Open terminal", css_classes=["suggested-action", "pill"], halign=Gtk.Align.CENTER,
                            margin_bottom=18)
        create.connect("clicked", lambda *_: self._create())
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(page)
        box.append(create)
        tv = Adw.ToolbarView(content=box)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self._sync()

    @property
    def session(self) -> ClusterSession:
        return self.live[self.cluster.get_selected()]

    def _sync(self) -> None:
        a = self.session.allocation
        options = ["Login node"] + ([f"Compute node {a.node} (job {a.job_id})"] if a else [])
        self.where.set_model(Gtk.StringList.new(options))
        self.where.set_selected(len(options) - 1)
        self.where.set_subtitle("" if a else "No compute node right now. Get one on the cluster card.")

    def _pick_color(self, c: str) -> None:
        self.color = c
        for b, col in zip(self.color_btns, tmux.COLORS):
            if col != c:
                b.set_active(False)

    def _browse(self) -> None:
        from .folder_picker import FolderPicker
        FolderPicker(self.session, self.folder.get_subtitle() or "~", self.folder.set_subtitle).present(self)

    def _create(self) -> None:
        self.close()
        self.on_create(self.session, self.where.get_selected() == 1, self.name.get_text().strip() or "Terminal",
                       self.color, self.folder.get_subtitle() or "~")
