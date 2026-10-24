"""Ask all: one prompt to every agent you pick; answers land in one folder."""

import posixpath
import shlex
import time
from collections.abc import Callable

from gi.repository import Adw, Gtk

from ..agents import AGENTS, Agent
from ..connect.session import ClusterSession
from ..files.ui.folder_picker import FolderPicker
from .widgets import bg


def answers_folder(folder: str) -> str:
    return posixpath.join(folder.rstrip("/") or "~", ".hpc-hub", "ask", time.strftime("%Y%m%d-%H%M"))


def installed(s: ClusterSession) -> set[str]:
    """Which agent commands an interactive shell on the cluster can find (PATH or ~/.bashrc)."""
    names = " ".join(shlex.quote(getattr(s.cfg, a.id).command or a.id) for a in AGENTS)
    line = f"for c in {names}; do type -t \"$c\" >/dev/null 2>&1 && echo \"$c\"; done"
    res = s.ssh.run(f"bash -ic {shlex.quote(line)} 2>/dev/null </dev/null", timeout=45)
    found = set(res.stdout.split())
    return {a.id for a in AGENTS if (getattr(s.cfg, a.id).command or a.id) in found}


class AskAllDialog(Adw.Dialog):
    """on_ask(folder, answers folder, prompt, [agents], discuss)."""

    def __init__(self, s: ClusterSession, on_ask: Callable[[str, str, str, list[Agent], bool], None],
                 folder: str = ""):
        super().__init__(title=f"Ask all on {s.cfg.name}", content_width=620, content_height=780)
        self.s, self.on_ask = s, on_ask
        page = Adw.PreferencesPage()

        where = Adw.PreferencesGroup(description="Every agent you pick gets the same prompt and works in this "
                                                 "folder. Each one writes its answer to the answers folder.")
        self.folder = Adw.EntryRow(title="Folder")
        self.folder.set_text(folder or s.cfg.claude.workdir or "~")
        browse = Gtk.Button(icon_name="folder-open-symbolic", tooltip_text="Choose folder", valign=Gtk.Align.CENTER,
                            css_classes=["flat"])
        browse.connect("clicked", lambda *_: FolderPicker(s, self.folder.get_text().strip() or "~",
                                                         self.folder.set_text).present(self))
        self.folder.add_suffix(browse)
        self.out = Adw.EntryRow(title="Answers folder")
        self.out.set_text(answers_folder(self.folder.get_text()))
        self._auto_out = self.out.get_text()
        self.folder.connect("changed", lambda *_: self._folder_changed())
        where.add(self.folder)
        where.add(self.out)
        page.add(where)

        ask = Adw.PreferencesGroup(title="Prompt")
        self.prompt = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR, top_margin=10, bottom_margin=10,
                                   left_margin=10, right_margin=10, accepts_tab=False)
        frame = Gtk.Frame(child=Gtk.ScrolledWindow(child=self.prompt, min_content_height=160, max_content_height=320,
                                                   propagate_natural_height=True))
        frame.add_css_class("card")
        ask.add(frame)
        page.add(ask)

        who = Adw.PreferencesGroup(title="Agents", description="Checking which ones are installed…")
        self.who = who
        self.rows: dict[str, Adw.SwitchRow] = {}
        for a in AGENTS:
            row = Adw.SwitchRow(title=a.name, active=True)
            row.add_prefix(Gtk.Image(icon_name=a.icon))
            who.add(row)
            self.rows[a.id] = row
        self.discuss = Adw.SwitchRow(title="Let them read each other's answers",
                                     subtitle="Round 2: each reads the others' answers and writes a second one, "
                                              "like claude.round2.md")
        who.add(self.discuss)
        page.add(who)

        go = Adw.PreferencesGroup()
        self.go = Adw.ButtonRow(title="Ask all", start_icon_name="mail-send-symbolic")
        self.go.add_css_class("suggested-action")
        self.go.connect("activated", lambda *_: self._ask())
        go.add(self.go)
        page.add(go)

        head = Gtk.Box(spacing=8)
        head.append(Gtk.Image(icon_name="system-users-symbolic", pixel_size=20))
        head.append(Gtk.Label(label=self.get_title(), css_classes=["title"]))
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar(title_widget=head))
        self.set_child(tv)
        self.connect("map", lambda *_: self.prompt.grab_focus())
        bg(lambda: installed(s), self._installed)

    def _folder_changed(self) -> None:
        if self.out.get_text() == self._auto_out:  # follow the folder until you edit it yourself
            self._auto_out = answers_folder(self.folder.get_text().strip())
            self.out.set_text(self._auto_out)

    def _installed(self, found: set[str] | None, err: str) -> None:
        if err or found is None:
            self.who.set_description("Could not check which agents are installed.")
            return
        for a in AGENTS:
            row = self.rows[a.id]
            if a.id not in found:
                row.set_active(False)
                row.set_sensitive(False)
                row.set_subtitle(f"not installed ('{getattr(self.s.cfg, a.id).command or a.id}' not found)")
        self.who.set_description("Pick who answers. Turn on Skip permission prompts in an agent's own dialog so "
                                 "it can write its file; otherwise its printed answer is saved.")

    def _ask(self) -> None:
        buf = self.prompt.get_buffer()
        text = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False).strip()
        picked = [a for a in AGENTS if self.rows[a.id].get_active() and self.rows[a.id].get_sensitive()]
        if not text:
            self.add_toast(Adw.Toast(title="Write a prompt first"))
            return
        if not picked:
            self.add_toast(Adw.Toast(title="Pick at least one agent"))
            return
        folder = self.folder.get_text().strip() or "~"
        out = self.out.get_text().strip() or answers_folder(folder)
        self.close()
        self.on_ask(folder, out, text, picked, self.discuss.get_active())
