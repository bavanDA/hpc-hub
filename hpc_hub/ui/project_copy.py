"""Copy or sync a project to another cluster: through this laptop or with Globus, leaving big subfolders behind,
and with its Claude chats so you can continue them there."""

import posixpath
from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from .. import chat_copy, chats, remote_fs, transfer
from ..projects import Project
from ..session import ClusterSession
from .folder_picker import FolderPicker
from .widgets import bg

HOW = [("laptop", "Through this laptop", "Simple; fine for smaller projects"),
       ("globus", "Globus", "Cluster to cluster, for big projects. Copying again only sends what changed")]


class ProjectCopyDialog(Adw.Dialog):
    def __init__(self, p: Project, src: ClusterSession, targets: list[ClusterSession], act, on_saved: Callable[[], None],
                 toast: Callable[[str], None]):
        super().__init__(title=f"Copy or sync {p.name}", content_width=580, content_height=760)
        self.p, self.src, self.targets, self.act, self.on_saved, self.toast = p, src, targets, act, on_saved, toast
        self.name = posixpath.basename(p.path.rstrip("/"))
        self.parts: list[tuple[str, int, Gtk.CheckButton]] = []
        self.chats: list[tuple[chats.Chat, Gtk.CheckButton]] = []
        page = Adw.PreferencesPage()

        to = Adw.PreferencesGroup(title="To")
        self.cluster = Adw.ComboRow(title="Cluster", model=Gtk.StringList.new([s.cfg.name for s in targets]))
        ids = [s.cfg.id for s in targets]
        self.cluster.set_selected(ids.index(p.copy_to) if p.copy_to in ids else 0)
        self.into = Adw.EntryRow(title="Into folder")
        self.into.set_text(p.copy_into or "~")
        browse = Gtk.Button(icon_name="folder-open-symbolic", tooltip_text="Choose folder", valign=Gtk.Align.CENTER,
                            css_classes=["flat"])
        browse.connect("clicked", lambda *_: self._browse())
        self.into.add_suffix(browse)
        self.result = Adw.ActionRow(title="Will be", css_classes=["property"])
        for row in (self.cluster, self.into, self.result):
            to.add(row)
        page.add(to)

        how = Adw.PreferencesGroup(title="How")
        self.how = Adw.ComboRow(title="Copy with", model=Gtk.StringList.new([h[1] for h in HOW]))
        self.globus_note = Adw.ActionRow(title="Globus is not ready", subtitle_lines=0, css_classes=["warning"])
        setup = Gtk.Button(label="Set up", valign=Gtk.Align.CENTER)
        setup.connect("clicked", lambda *_: (self.close(), act.open_globus()))
        self.globus_note.add_suffix(setup)
        how.add(self.how)
        how.add(self.globus_note)
        page.add(how)

        self.what = Adw.PreferencesGroup(title="What", description="Measuring sizes…")
        page.add(self.what)
        self.chat_group = Adw.PreferencesGroup(title="Claude chats in this project", description="Loading…")
        page.add(self.chat_group)

        cancel = Gtk.Button(label="Cancel")
        cancel.connect("clicked", lambda *_: self.close())
        self.go = Gtk.Button(label="Copy", css_classes=["suggested-action"])
        self.go.connect("clicked", lambda *_: self._go())
        bar = Adw.HeaderBar(show_end_title_buttons=False, show_start_title_buttons=False)
        bar.pack_start(cancel)
        bar.pack_end(self.go)
        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(bar)
        self.set_child(tv)

        for w, sig in ((self.cluster, "notify::selected"), (self.how, "notify::selected"), (self.into, "changed")):
            w.connect(sig, lambda *_: self._sync())
        self._sync()
        bg(lambda: transfer.subfolder_sizes(src.ssh, p.path), self._show_parts)
        bg(lambda: chats.list_chats(src.ssh, "claude", 400), self._show_chats)

    # -- state ----------------------------------------------------------------------------
    @property
    def dst(self) -> ClusterSession:
        return self.targets[self.cluster.get_selected()]

    @property
    def globus(self) -> bool:
        return HOW[self.how.get_selected()][0] == "globus"

    def _globus_missing(self) -> str:
        client = self.act.globus_client()
        missing = [] if client else ["your Globus app id"]
        if client and not client.logged_in:
            missing.append("signing in")
        missing += [f"a Globus collection for {s.cfg.name}" for s in (self.src, self.dst)
                    if not s.cfg.globus.collection_id]
        return ", ".join(missing)

    def _sync(self) -> None:
        into = self.into.get_text().strip() or "~"
        self.result.set_subtitle(GLib.markup_escape_text(f"{self.dst.cfg.name}:{posixpath.join(into, self.name)}"))
        self.how.set_subtitle(HOW[self.how.get_selected()][2])
        missing = self._globus_missing() if self.globus else ""
        self.globus_note.set_visible(bool(missing))
        self.globus_note.set_subtitle(f"Needs {missing}. Set it up on the Globus page." if missing else "")
        self.go.set_label("Sync" if self.globus else "Copy")
        self.go.set_sensitive(not missing)
        self._total()

    def _browse(self) -> None:
        dst = self.dst
        if not dst.connected:
            self.toast(f"Connect to {dst.cfg.name} first")
            return
        FolderPicker(dst, self.into.get_text().strip() or "~", self.into.set_text).present(self)

    # -- what to copy ---------------------------------------------------------------------
    def _show_parts(self, sizes, err) -> None:
        if err or sizes is None:
            self.what.set_description(GLib.markup_escape_text(f"Could not measure it: {err}"))
            return
        for name, size in sizes:
            check = Gtk.CheckButton(active=name != ".claude", valign=Gtk.Align.CENTER)  # Claude's own work copies
            check.connect("toggled", lambda *_: self._total())
            row = Adw.ActionRow(title=GLib.markup_escape_text(name), activatable_widget=check)
            row.add_prefix(check)
            row.add_suffix(Gtk.Label(label=GLib.format_size(size), css_classes=["dim-label", "numeric"]))
            self.what.add(row)
            self.parts.append((name, size, check))
        self._total()

    def _show_chats(self, found, err) -> None:
        if err or found is None:
            self.chat_group.set_description(GLib.markup_escape_text(f"Could not read chats: {err}"))
            return
        root = self.p.path.rstrip("/")
        mine = [c for c in found if c.cwd == root or c.cwd.startswith(root + "/")]
        self.chat_group.set_description("Copied too, so you can continue them there. Paths move to the new "
                                        "folder." if mine else "No Claude chats in this folder.")
        for c in mine:
            check = Gtk.CheckButton(active=True, valign=Gtk.Align.CENTER)
            check.connect("toggled", lambda *_: self._total())
            row = Adw.ActionRow(title=GLib.markup_escape_text(c.name), title_lines=1, activatable_widget=check)
            row.add_prefix(check)
            row.add_suffix(Gtk.Label(label=GLib.format_size(c.size), css_classes=["dim-label", "numeric"]))
            self.chat_group.add(row)
            self.chats.append((c, check))
        self._total()

    def _total(self) -> int:
        files = sum(size for _, size, c in self.parts if c.get_active())
        talk = sum(c.size for c, check in self.chats if check.get_active())
        if self.parts:
            how = "with Globus" if self.globus else "through this laptop"
            note = f"{GLib.format_size(files)} {how}. Untick what to leave behind."
            if not self.globus and files > 5 * 1024 ** 3:
                note += " That is big: Globus is much faster."
            self.what.set_description(note)
        return files + talk

    # -- go -------------------------------------------------------------------------------
    def _go(self) -> None:
        src, dst, p = self.src, self.dst, self.p
        if not dst.connected:
            self.toast(f"Connect to {dst.cfg.name} first")
            return
        into = self.into.get_text().strip() or "~"
        skip = [name for name, _, c in self.parts if not c.get_active()]
        size = sum(size for _, size, c in self.parts if c.get_active())
        picked = [c for c, check in self.chats if check.get_active()]
        use_globus = self.globus
        p.copy_to, p.copy_into = dst.cfg.id, into
        self.on_saved()
        self.close()

        def where():
            return remote_fs.expand(dst.ssh, into).rstrip("/") or "/"

        def started(parent, err):
            if err:
                self.toast(f"Could not start: {err}")
                return
            dest = posixpath.join(parent, self.name)
            if use_globus:
                bg(lambda: self.act.globus_client().submit(
                    src.cfg.globus.collection_id, p.path, dst.cfg.globus.collection_id, dest,
                    f"{p.name} to {dst.cfg.name}", True, sync_level=2, skip=skip),
                   lambda task, e: self.toast(f"Globus could not start: {e}" if e else
                                              f"Globus is syncing {p.name} to {dst.cfg.name}. Progress on the "
                                              "Globus page"))
            else:
                self.act.copy(src, p.path, dst, parent, skip, size)
            if picked:
                bg(lambda: [chat_copy.copy(src.ssh, c, dst.ssh, dest, transfer.Progress()) for c in picked],
                   lambda _r, e: self.toast(f"Copying chats failed: {e}" if e else
                                            f"Copied {len(picked)} chats. Continue them from Claude on "
                                            f"{dst.cfg.name}"))
        bg(where, started)
