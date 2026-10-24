"""One terminal: VTE running ssh, copy and paste, and links it prints."""

import os
from collections.abc import Callable
from dataclasses import dataclass

import gi

gi.require_version("Vte", "3.91")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, Pango, Vte  # noqa: E402

from ... import links, tmux  # noqa: E402
from ...links import Link  # noqa: E402
from ...connect.session import ClusterSession  # noqa: E402
from ..widgets import bg  # noqa: E402


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
        bg(lambda: fetch() if fetch else "", done)

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
