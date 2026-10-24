"""Git for a LaTeX project: the Pull / Push popover and the full Git dialog."""

from gi.repository import Adw, GLib, Gtk

from ... import git
from ...connect.session import ClusterSession
from ..widgets import bg


class GitMixin:
    """LatexPage's Git button."""

    def _git_popover(self) -> Gtk.Popover:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=6, margin_bottom=6,
                      margin_start=6, margin_end=6)
        pop = Gtk.Popover(child=box)
        for label, icon, fn in (("Pull", "go-down-symbolic", lambda: self._git("Pulled", git.pull)),
                                ("Push", "go-up-symbolic", lambda: self._git("Pushed", git.push)),
                                ("Commit, history and remote…", "vcs-branch-symbolic",
                                 lambda: GitDialog(self.session, self.folder).present(self.get_root()))):
            b = Gtk.Button(child=Adw.ButtonContent(label=label, icon_name=icon), css_classes=["flat"])
            b.connect("clicked", lambda *_, f=fn: (pop.popdown(), self.session and f()))
            box.append(b)
        return pop

    def _git(self, ok: str, fn) -> None:
        s, folder = self.session, self.folder

        def work():
            if self.dirty:
                raise git.GitError("Save first")
            return fn(s.ssh, folder)

        def done(out, err):
            if err:
                self.toast(f"Git: {err.splitlines()[-1] if err.strip() else err}")
                return
            self.toast(ok)
            if ok == "Pulled":  # files may have changed under us
                self._refresh_files()
                if self.current:
                    self._load_file(self.current, self._cursor_line())
        bg(work, done)


class GitDialog(Adw.Dialog):
    def __init__(self, session: ClusterSession, folder: str):
        super().__init__(title="Git", content_width=720, content_height=680)
        self.session, self.folder = session, folder
        self.page = Adw.PreferencesPage()
        self.toasts = Adw.ToastOverlay(child=self.page)
        tv = Adw.ToolbarView(content=self.toasts)
        header = Adw.HeaderBar()
        refresh = Gtk.Button(icon_name="view-refresh-symbolic", tooltip_text="Refresh")
        refresh.connect("clicked", lambda *_: self.load())
        header.pack_start(refresh)
        tv.add_top_bar(header)
        self.set_child(tv)
        self.groups: list[Adw.PreferencesGroup] = []
        self.load()

    def _clear(self) -> None:
        for g in self.groups:
            self.page.remove(g)
        self.groups = []

    def _group(self, **kw) -> Adw.PreferencesGroup:
        g = Adw.PreferencesGroup(**kw)
        self.page.add(g)
        self.groups.append(g)
        return g

    def load(self) -> None:
        s = self.session
        bg(lambda: git.info(s.ssh, self.folder), self._show)

    def _show(self, info: git.RepoInfo | None, err: str) -> None:
        self._clear()
        if err or not info:
            self._group(title="Git error", description=GLib.markup_escape_text(err))
            return
        if not info.root:
            self._group(title="Not a git repository", description=GLib.markup_escape_text(self.folder))
            return
        repo = self._group(title="Repository")
        repo.add(Adw.ActionRow(title="Folder", subtitle=GLib.markup_escape_text(info.root), subtitle_selectable=True,
                               css_classes=["property"]))
        repo.add(Adw.ActionRow(title="Branch", subtitle=info.branch or "(detached)", css_classes=["property"]))
        for name, url in info.remotes.items():
            row = Adw.ActionRow(title=f"Remote {name}", subtitle=GLib.markup_escape_text(url),
                                subtitle_selectable=True, css_classes=["property"])
            copy = Gtk.Button(icon_name="edit-copy-symbolic", valign=Gtk.Align.CENTER, css_classes=["flat"],
                              tooltip_text="Copy address")
            copy.connect("clicked", lambda *_, u=url: (self.get_clipboard().set(u),
                                                       self.toasts.add_toast(Adw.Toast(title="Copied"))))
            row.add_suffix(copy)
            repo.add(row)
        if not info.remotes:
            repo.add(Adw.ActionRow(title="Remote", subtitle="none", css_classes=["property"]))

        work = self._group(title="Changes", description=f"{len(info.changes)} changed files" if info.changes
                           else "Nothing to commit")
        for line in info.changes[:30]:
            work.add(Adw.ActionRow(title=GLib.markup_escape_text(line[3:]), subtitle=line[:2].strip()))
        msg = Adw.EntryRow(title="Commit message")
        work.add(msg)
        buttons = Gtk.Box(spacing=6, halign=Gtk.Align.END, margin_top=8)
        for label, fn, cls in (("Pull", lambda: git.pull(self.session.ssh, self.folder), ""),
                               ("Commit", None, "suggested-action"),
                               ("Push", lambda: git.push(self.session.ssh, self.folder), "")):
            b = Gtk.Button(label=label, css_classes=[cls] if cls else [])
            if label == "Commit":
                b.set_sensitive(bool(info.changes))
                b.connect("clicked", lambda *_: self._run(
                    "Committed", lambda: git.commit_all(self.session.ssh, self.folder, msg.get_text().strip()))
                    if msg.get_text().strip() else self.toasts.add_toast(Adw.Toast(title="Write a message first")))
            else:
                b.connect("clicked", lambda *_, f=fn, name=label: self._run(f"{name} done", f))
            buttons.append(b)
        work.set_header_suffix(buttons)

        hist = self._group(title="History", description=f"Last {len(info.history)} commits")
        for c in info.history:
            row = Adw.ActionRow(title=GLib.markup_escape_text(c.subject),
                                subtitle=GLib.markup_escape_text(f"{c.hash} · {c.date} · {c.author}"),
                                activatable=True)
            row.connect("activated", lambda *_, h=c.hash, t=c.subject: self._show_commit(h, t))
            row.add_suffix(Gtk.Image.new_from_icon_name("go-next-symbolic"))
            hist.add(row)

    def _run(self, ok: str, fn) -> None:
        self.toasts.add_toast(Adw.Toast(title="Working…", timeout=2))

        def done(_r, err):
            self.toasts.add_toast(Adw.Toast(title=err.splitlines()[-1] if err else ok, timeout=5))
            self.load()
        bg(fn, done)

    def _show_commit(self, commit: str, title: str) -> None:
        view = Gtk.TextView(editable=False, monospace=True, top_margin=8, left_margin=8)
        tv = Adw.ToolbarView(content=Gtk.ScrolledWindow(child=view, vexpand=True))
        tv.add_top_bar(Adw.HeaderBar())
        Adw.Dialog(title=f"{commit} · {title}", content_width=860, content_height=700, child=tv).present(self)
        bg(lambda: git.show(self.session.ssh, self.folder, commit),
           lambda text, err: view.get_buffer().set_text(err or text))
