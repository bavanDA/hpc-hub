"""The Sessions and Logs lists: tmux sessions per cluster, and open VS Code logs."""

import time

from gi.repository import Gtk, Pango

from ... import links, tmux
from ...links import Link
from ...session import ClusterSession
from ..widgets import bg, color_dot, open_uri
from .terminal_tab import View


def _ago(ts: int) -> str:
    if not ts:
        return ""
    m = int(max(0, time.time() - ts) // 60)
    return f"{m} min" if m < 60 else f"{m // 60} h" if m < 48 * 60 else f"{m // 1440} days"


AGENT_NAMES = {"claude": "Claude", "codex": "ChatGPT", "agy": "Antigravity", "cursor": "Cursor",
               "ask": "Ask all", "term": "Terminal"}
REMOTE_AGENTS = ("claude", "codex", "agy", "cursor")


class SessionListMixin:
    """TerminalsPage: fills self.list and self.log_list from tmux listings."""

    def refresh(self) -> None:
        live = [s for s in self.sessions if s.connected]
        for s in self.sessions:
            if s not in live:
                self.listings.pop(s.cfg.id, None)
        self._fill()
        for s in live:
            bg(lambda s=s: tmux.list_sessions(s.ssh), lambda listing, err, s=s: self._listed_in(s, listing))

    def _listed_in(self, s: ClusterSession, listing: tmux.Listing | None) -> None:
        if not listing:
            return
        self.listings[s.cfg.id] = listing
        self._look_for_remotes(s, listing)
        for t in listing.sessions:
            self.starting.pop((s.cfg.id, t.name), None)
        if self.current and self.current.session is s:  # keep the header in step with renames
            t = self._listed(self.current.key)
            if t:
                self.current.tmux_session, self.current.title = t, t.title
                self.current.color = t.color or tmux.AGENT_COLORS.get(t.agent, "") or self.current.color
                self._header(self.current)
        self._fill()

    def _look_for_remotes(self, s: ClusterSession, listing: tmux.Listing) -> None:
        """Agent sessions print their remote link once; find it in the pane and keep it on the session.
        Pairing codes change, so those are looked up again (at most once a minute)."""
        now = time.monotonic()
        look = [t for t in listing.sessions
                if t.kind == "tmux" and t.agent in REMOTE_AGENTS and (not t.remote or t.remote.startswith("code:"))
                and now - self.remote_checked.get((s.cfg.id, t.name), 0) > 60]
        if not look:
            return
        for t in look:
            self.remote_checked[(s.cfg.id, t.name)] = now

        def work():
            found = tmux.find_remotes(s.ssh, look)
            changed = {t.name: found[t.name] for t in look if t.name in found and found[t.name] != t.remote}
            if changed:
                s.ssh.run("; ".join(tmux.set_remote(t, changed[t.name]) for t in look if t.name in changed))
            return changed

        def done(changed, err):
            if changed and self.listings.get(s.cfg.id) is listing:
                for t in listing.sessions:
                    t.remote = changed.get(t.name, t.remote)
                self._fill()
        bg(work, done)

    def _remember_remote(self, view: "View", link: Link) -> None:
        """An open tab saw the link: save it on the tmux session so the list can show it."""
        if not (view.session and view.session.ssh and view.tmux_session):
            return
        value = link.url if link.kind == links.REMOTE else f"code:{link.code}"
        if view.tmux_session.remote == value:
            return
        view.tmux_session.remote = value
        ssh, t = view.session.ssh, view.tmux_session
        bg(lambda: ssh.run(tmux.set_remote(t, value)), lambda *_: self._fill())

    def _use_link(self, value: str) -> None:
        if value.startswith("code:"):
            self.get_clipboard().set(value[5:])
            self.toast(f"Pairing code {value[5:]} copied. In the ChatGPT app: Codex, connect a machine.")
        else:
            open_uri(self, value)

    def _fill(self) -> None:
        self.list.remove_all()
        self.log_list.remove_all()
        for v in self.logs:
            self.log_list.append(self._log_row(v))
        self.logs_badge.set_label(str(len(self.logs)))
        self.logs_badge.set_visible(bool(self.logs))
        self._fill_launch()
        live = [s for s in self.sessions if s.connected]
        if not live:
            self.list.append(self._note("Connect a cluster to see its sessions."))
        for s in live:
            listing = self.listings.get(s.cfg.id)
            head = self._note(s.cfg.name, heading=True)
            if listing and listing.host:
                head.set_tooltip_text("Sessions are kept by tmux, so they survive closing the app. Agents run "
                                      "tmux on their compute node and end with its job; older sessions may "
                                      f"still be on {listing.host}.")
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
        if t.node:
            node = t.node
        elif t.job and nodes is not None:
            node = nodes.get(t.job, "node ended")
            state = "" if node == "node ended" and state == "running" else state
        else:
            node = ""
        bits = [what, node, _ago(t.created), state]
        text.append(Gtk.Label(label=" · ".join(b for b in bits if b), xalign=0, ellipsize=Pango.EllipsizeMode.END,
                              css_classes=["dim-label", "caption"]))
        box.append(text)
        if t.remote:
            code = t.remote.startswith("code:")
            link = Gtk.Button(label="Copy code" if code else "Open", css_classes=["flat", "accent"],
                              valign=Gtk.Align.CENTER,
                              tooltip_text=f"Copy pairing code {t.remote[5:]}" if code else f"Open remote: {t.remote}")
            link.connect("clicked", lambda *_, v=t.remote: self._use_link(v))
            box.append(link)
        menu = Gtk.MenuButton(icon_name="view-more-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER)
        menu.set_popover(self._menu(s, t))
        box.append(menu)
        row.set_child(box)
        row.set_tooltip_text(f"{t.name} ({t.kind}){' in ' + t.path if t.path else ''}")
        row.key = (s.cfg.id, t.name)
        row.open = lambda: self.attach(s, t)
        return row
