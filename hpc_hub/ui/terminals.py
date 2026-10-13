"""Terminals tab: VS Code and Claude run here, one tab each, with link banners."""

import os
from collections.abc import Callable

import gi

gi.require_version("Vte", "3.91")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, Pango, Vte  # noqa: E402

from .. import links  # noqa: E402
from ..links import Link  # noqa: E402


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

        self.term = Vte.Terminal(vexpand=True, hexpand=True, scrollback_lines=20000)
        self.term.set_font(Pango.FontDescription.from_string("Monospace 11"))
        self.term.connect("contents-changed", self._changed)
        self.term.connect("child-exited", self._exited)
        self.append(self.term)
        self._scan_pending = False

        env = [f"{k}={v}" for k, v in os.environ.items()] + ["TERM=xterm-256color"]
        self.term.spawn_async(Vte.PtyFlags.DEFAULT, None, argv, env, GLib.SpawnFlags.SEARCH_PATH,
                              None, None, -1, None, None)

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


class TerminalsPage(Gtk.Box):
    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.view = Adw.TabView(vexpand=True)
        self.bar = Adw.TabBar(view=self.view, autohide=False)
        self.empty = Adw.StatusPage(
            icon_name="utilities-terminal-symbolic", title="No sessions",
            description="Start VS Code or Claude from a connected cluster card.")
        self.stack = Gtk.Stack(vexpand=True)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        box.append(self.bar)
        box.append(self.view)
        self.stack.add_named(box, "tabs")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)
        self.view.connect("notify::n-pages", lambda *_: self._sync())
        self.view.connect("close-page", self._close_page)
        self._sync()

    def _sync(self) -> None:
        self.stack.set_visible_child_name("tabs" if self.view.get_n_pages() else "empty")

    def _close_page(self, view, page) -> bool:
        page.get_child().kill()
        view.close_page_finish(page, True)
        return Gdk.EVENT_STOP

    def open(self, title: str, argv: list[str], icon: str, node: str = "",
             on_link: Callable[[TerminalTab, Link], None] | None = None) -> TerminalTab:
        tab = TerminalTab(argv, node, on_link)
        page = self.view.append(tab)
        page.set_title(title)
        page.set_tooltip(title)
        page.set_icon(Gio.ThemedIcon.new(icon))
        self.view.set_selected_page(page)
        tab.term.grab_focus()
        return tab

