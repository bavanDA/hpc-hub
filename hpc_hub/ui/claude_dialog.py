"""Claude: pick a past chat to resume, or start a new one in a folder."""

import datetime
import posixpath
import threading
import time
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import claude_chats, remote_fs
from ..claude_chats import Chat
from ..session import ClusterSession
from .folder_picker import FolderPicker


def when(ts: int) -> str:
    t = time.localtime(ts)
    days = (datetime.date.today() - datetime.date.fromtimestamp(ts)).days
    clock = time.strftime("%H:%M", t)
    if days <= 0:
        return f"Today {clock}"
    if days == 1:
        return f"Yesterday {clock}"
    return time.strftime("%b %d %H:%M" if days < 300 else "%b %d %Y", t)


def short(path: str, home: str = "") -> str:
    if home and (path == home or path.startswith(home + "/")):
        return "~" + path[len(home):]
    return path


class ClaudeDialog(Adw.Dialog):
    """on_run(folder, chat id or "") after saving the two options on cfg.claude."""

    def __init__(self, s: ClusterSession, on_run: Callable[[str, str], None], save: Callable[[], None],
                 project: str = ""):
        title = f"Claude in {posixpath.basename(project.rstrip('/'))}" if project else f"Claude on {s.cfg.name}"
        super().__init__(title=title, content_width=600, content_height=720)
        self.s, self.on_run, self.save, self.project = s, on_run, save, project.rstrip("/")
        c = s.cfg.claude
        page = Adw.PreferencesPage()

        opts = Adw.PreferencesGroup()
        self.skip = Adw.SwitchRow(title="Skip permission prompts", subtitle="--dangerously-skip-permissions",
                                  active=c.skip_permissions)
        a = s.allocation
        self.new = Adw.SwitchRow(title="Use a new compute node", active=c.new_node,
                                 subtitle=f"Off: same node as now ({a.node}, job {a.job_id})" if a
                                 else "Off: same node (requested if needed)")
        opts.add(self.skip)
        opts.add(self.new)
        page.add(opts)

        new_chat = Adw.PreferencesGroup(title="New chat")
        self.folder = Adw.EntryRow(title="Folder")
        self.folder.set_text(project or c.workdir)
        browse = Gtk.Button(icon_name="folder-open-symbolic", tooltip_text="Choose folder", valign=Gtk.Align.CENTER,
                            css_classes=["flat"])
        browse.connect("clicked", lambda *_: FolderPicker(s, self.folder.get_text().strip(),
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

        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
        self._load()

    def _load(self) -> None:
        s = self.s

        def work():
            try:
                result = (claude_chats.list_chats(s.ssh, 400 if self.project else claude_chats.LIMIT),
                          remote_fs.home(s.ssh), "")
            except Exception as e:  # noqa: BLE001
                result = ([], "", str(e))
            GLib.idle_add(lambda: self._show(*result) and False)

        threading.Thread(target=work, daemon=True).start()

    def _show(self, chats: list[Chat], home: str, err: str) -> None:
        if err:
            self.chats.set_description(GLib.markup_escape_text(f"Could not read chats: {err}"))
            return
        if self.project:
            chats = [c for c in chats if c.cwd == self.project or c.cwd.startswith(self.project + "/")]
        self.chats.set_description("Pick one to continue it." if chats
                                   else "No chats here yet." if self.project else "No chats yet on this cluster.")
        self.search.set_visible(len(chats) > 6)
        for chat in chats:
            row = Adw.ActionRow(title=GLib.markup_escape_text(chat.name), activatable=True, title_lines=1,
                                subtitle=GLib.markup_escape_text(f"{when(chat.mtime)} · {short(chat.cwd, home)}"))
            row.add_suffix(Gtk.Image(icon_name="go-next-symbolic"))
            row.connect("activated", lambda _r, c=chat: self._run(c.cwd or "~", c.id))
            row.haystack = f"{chat.name} {chat.first} {chat.last} {chat.cwd}".lower()
            self.chats.add(row)
            self.rows.append(row)

    def _filter(self) -> None:
        q = self.search.get_text().lower().strip()
        for row in self.rows:
            row.set_visible(not q or all(w in row.haystack for w in q.split()))

    def _run(self, folder: str, chat_id: str) -> None:
        c = self.s.cfg.claude
        c.skip_permissions, c.new_node = self.skip.get_active(), self.new.get_active()
        if not chat_id:
            c.workdir = folder
        self.save()
        self.close()
        self.on_run(folder, chat_id)
