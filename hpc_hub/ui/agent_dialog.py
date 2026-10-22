"""Claude, ChatGPT, Antigravity or Cursor: pick a past chat to resume, or start a new one in a folder."""

import datetime
import posixpath
import time
from collections.abc import Callable
from dataclasses import dataclass, replace

from gi.repository import Adw, GLib, Gtk

from .. import chats as chat_store
from .. import remote_fs
from ..agents import Agent
from ..chats import Chat
from ..config import ComputeProfile
from ..limits import slurm_time
from ..session import ClusterSession
from .compute_dialog import ComputeGroup
from .folder_picker import FolderPicker, short
from .widgets import bg


def when(ts: int) -> str:
    t = time.localtime(ts)
    days = (datetime.date.today() - datetime.date.fromtimestamp(ts)).days
    clock = time.strftime("%H:%M", t)
    if days <= 0:
        return f"Today {clock}"
    if days == 1:
        return f"Yesterday {clock}"
    return time.strftime("%b %d %H:%M" if days < 300 else "%b %d %Y", t)


@dataclass
class Launch:
    folder: str
    chat_id: str = ""  # "" = a new chat
    label: str = ""
    task: str = ""  # first prompt the agent starts working on
    profile: ComputeProfile | None = None  # resources if a node is requested


class AgentDialog(Adw.Dialog):
    """on_run(Launch) after saving the options on the cluster's agent settings."""

    def __init__(self, agent: Agent, s: ClusterSession, on_run: Callable[[Launch], None],
                 save: Callable[[], None], project: str = ""):
        where = f"in {posixpath.basename(project.rstrip('/'))}" if project else f"on {s.cfg.name}"
        super().__init__(title=f"{agent.name} {where}", content_width=600, content_height=760)
        self.agent, self.s, self.on_run, self.save, self.project = agent, s, on_run, save, project.rstrip("/")
        c = self.settings = getattr(s.cfg, agent.id)
        page = Adw.PreferencesPage()

        opts = Adw.PreferencesGroup()
        self.remote = Adw.SwitchRow(title=agent.remote_label, subtitle=agent.remote_hint, active=c.remote)
        a = s.allocation
        self.new = Adw.SwitchRow(title="Use a new compute node", active=c.new_node,
                                 subtitle=f"Off: same node as now ({a.node}, job {a.job_id})" if a
                                 else "Off: same node (requested if needed)")
        if agent.remote_label:  # Cursor has no remote control
            opts.add(self.remote)
        opts.add(self.new)
        page.add(opts)

        more = Adw.PreferencesGroup(title=f"{agent.name} options")
        self.option_rows: list[tuple] = []
        for o in agent.options:
            row = Adw.ComboRow(title=o.label, model=Gtk.StringList.new([label for _, label in o.choices]))
            values = [v for v, _ in o.choices]
            current = getattr(c, o.key)
            row.set_selected(values.index(current) if current in values else 0)
            more.add(row)
            self.option_rows.append((o, row))
        if agent.options:
            page.add(more)

        work = Adw.PreferencesGroup(title="Task", description="Optional. What it should work on; it starts right "
                                    "away, in a new chat or one you pick below.")
        self.task = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR, top_margin=8, bottom_margin=8, left_margin=10,
                                 right_margin=10, accepts_tab=False)
        frame = Gtk.Frame(child=Gtk.ScrolledWindow(child=self.task, min_content_height=72, max_content_height=160,
                                                   propagate_natural_height=True), )
        work.add(frame)
        page.add(work)
        base = c.compute if c.compute.cpus else replace(s.cfg.profile, time=slurm_time(c.minutes)) if c.minutes \
            else s.cfg.profile
        self.node = ComputeGroup(s, base, title="Compute node")
        self.new.connect("notify::active", lambda *_: self._node_note())
        self._node_note()
        page.add(self.node)

        new_chat = Adw.PreferencesGroup(title="New chat")
        self.folder = Adw.EntryRow(title="Folder")
        self.folder.set_text(project or c.workdir)
        browse = Gtk.Button(icon_name="folder-open-symbolic", tooltip_text="Choose folder", valign=Gtk.Align.CENTER,
                            css_classes=["flat"])
        browse.connect("clicked", lambda *_: FolderPicker(s, self.folder.get_text().strip() or "~",
                                                         self.folder.set_text).present(self))
        self.folder.add_suffix(browse)
        start = Adw.ButtonRow(title="Start new chat", start_icon_name="list-add-symbolic")
        start.add_css_class("suggested-action")
        start.connect("activated", lambda *_: self._run(self.folder.get_text().strip() or "~", ""))
        new_chat.add(self.folder)
        new_chat.add(start)
        page.add(new_chat)

        self.chats = Adw.PreferencesGroup(title="Chats in this project" if project else "Recent chats",
                                          description="Loading…")
        self.search = Gtk.SearchEntry(placeholder_text="Search", valign=Gtk.Align.CENTER, visible=False)
        self.search.connect("search-changed", lambda *_: self._filter())
        self.chats.set_header_suffix(self.search)
        page.add(self.chats)
        self.rows: list[Adw.ActionRow] = []

        head = Gtk.Box(spacing=8)
        head.append(Gtk.Image(icon_name=agent.icon, pixel_size=20))
        head.append(Gtk.Label(label=self.get_title(), css_classes=["title"]))
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar(title_widget=head))
        self.set_child(tv)
        self._load()

    def _node_note(self) -> None:
        a = self.s.allocation
        asks = self.new.get_active() or not a
        self.node.set_sensitive(asks)
        self.node.set_description("A new node with:" if self.new.get_active() else
                                  f"Uses your node {a.node}, nothing to ask for" if a else
                                  "You have no node yet, so it asks for one with:")

    def _load(self) -> None:
        s, limit = self.s, 400 if self.project else chat_store.LIMIT
        bg(lambda: (chat_store.list_chats(s.ssh, self.agent.id, limit), remote_fs.home(s.ssh), self._real(s)),
           self._show)

    def _real(self, s: ClusterSession) -> str:
        """The project folder with links resolved (/scratch is a link to /mmfs1/scratch on Wulver)."""
        if not self.project:
            return ""
        res = s.ssh.run(f"readlink -f {remote_fs.q(remote_fs.expand(s.ssh, self.project))}", timeout=30)
        return res.stdout.strip().rstrip("/")

    def _show(self, got: tuple[list[Chat], str] | None, err: str) -> None:
        if err or not got:
            self.chats.set_description(GLib.markup_escape_text(f"Could not read chats: {err}"))
            return
        chats, home, real = got
        if self.project:
            roots = {self.project, real} - {""}
            chats = [c for c in chats if any(c.cwd == r or c.cwd.startswith(r + "/") for r in roots)]
        self.chats.set_description("Pick one to continue it." if chats
                                   else "No chats here yet." if self.project else "No chats yet on this cluster.")
        self.search.set_visible(len(chats) > 6)
        for chat in chats:
            row = Adw.ActionRow(title=GLib.markup_escape_text(chat.name), activatable=True, title_lines=1,
                                subtitle=GLib.markup_escape_text(" · ".join(
                                    x for x in (when(chat.mtime), short(chat.cwd, home),
                                                GLib.format_size(chat.size) if chat.size else "") if x)))
            row.add_suffix(Gtk.Image(icon_name="go-next-symbolic"))
            row.connect("activated", lambda _r, c=chat: self._run(c.cwd or "~", c.id, c.name[:40]))
            row.haystack = f"{chat.name} {chat.first} {chat.last} {chat.cwd}".lower()
            self.chats.add(row)
            self.rows.append(row)

    def _filter(self) -> None:
        q = self.search.get_text().lower().strip()
        for row in self.rows:
            row.set_visible(not q or all(w in row.haystack for w in q.split()))

    def _run(self, folder: str, chat_id: str, label: str = "") -> None:
        c = self.settings
        c.new_node, c.remote = self.new.get_active(), self.remote.get_active()
        profile = self.node.read()
        if self.node.get_sensitive():
            c.compute = profile
        buf = self.task.get_buffer()
        task = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False).strip()
        for o, row in self.option_rows:
            setattr(c, o.key, o.choices[row.get_selected()][0])
        if not chat_id:
            c.workdir = folder
        self.save()
        self.close()
        self.on_run(Launch(folder, chat_id, label, task, profile if self.node.get_sensitive() else None))

