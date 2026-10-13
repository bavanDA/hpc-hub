"""VS Code and Claude on the compute node: dialogs + launch into a terminal tab."""

import threading
from collections.abc import Callable

from gi.repository import Adw, Gdk, GLib, Gtk

from .. import links, remote
from ..links import Link
from ..session import ClusterSession, State
from ..slurm import Allocation
from .terminals import TerminalsPage, TerminalTab


def _idle(fn, *args):
    GLib.idle_add(lambda: fn(*args) and False)


def _open_uri(widget: Gtk.Widget, uri: str) -> None:
    Gtk.UriLauncher.new(uri).launch(widget.get_root(), None, None, None)


class Tools:
    def __init__(self, window: Gtk.Window, terminals: TerminalsPage, show_terminals: Callable[[], None],
                 toast: Callable[[str], None], save_config: Callable[[], None]):
        self.window = window
        self.terminals = terminals
        self.show_terminals = show_terminals
        self.toast = toast
        self.save_config = save_config
        self.alias_cache: dict[str, dict[str, str]] = {}

    def _ready(self, s: ClusterSession) -> bool:
        if s.state != State.CONNECTED or not s.ssh:
            self.toast(f"Connect to {s.cfg.name} first")
            return False
        return True

    def _error(self, heading: str, body: str) -> None:
        d = Adw.AlertDialog(heading=heading, body=body)
        d.add_response("ok", "OK")
        d.present(self.window)

    def _aliases(self, s: ClusterSession, then: Callable[[dict[str, str]], None]) -> None:
        if s.cfg.id in self.alias_cache:
            then(self.alias_cache[s.cfg.id])
            return

        def work():
            try:
                found = remote.shell_aliases(s.ssh)
            except Exception:  # noqa: BLE001
                found = {}
            self.alias_cache[s.cfg.id] = found
            _idle(then, found)

        threading.Thread(target=work, daemon=True).start()

    # -- VS Code -------------------------------------------------------------------
    def vscode(self, s: ClusterSession) -> None:
        if not self._ready(s):
            return
        if not s.cfg.vscode.command:
            self.vscode_settings(s, then_start=True)
            return
        self.toast(f"Starting VS Code on {s.cfg.name}…")
        s.ensure_node(lambda a: _idle(self._start_vscode, s, a))

    def _start_vscode(self, s: ClusterSession, a: Allocation | None) -> None:
        if not a:
            self._error("No compute node", f"Could not get a node on {s.cfg.name}. See the card's log.")
            return
        v = s.cfg.vscode
        cmd = remote.in_tmux(f"hpchub-vscode-{a.job_id}", remote.on_node(a.job_id, v.workdir, v.command))
        self.terminals.open(f"VS Code · {s.cfg.name}", s.ssh.argv(cmd, tty=True), "text-editor-symbolic",
                            node=a.node, on_link=lambda tab, link: self._vscode_link(s, a, tab, link))
        self.show_terminals()

    def _vscode_link(self, s: ClusterSession, a: Allocation, tab: TerminalTab, link: Link) -> None:
        auto = s.cfg.vscode.open_links
        if link.kind == links.DEVICE_LOGIN:
            if link.code:
                Gdk.Display.get_default().get_clipboard().set(link.code)
            tab.add_banner(f"Sign in with code {link.code} (copied)", "Open sign-in page",
                           lambda: _open_uri(tab, link.url))
            if auto:
                _open_uri(tab, link.url)
        elif link.kind == links.TUNNEL:
            tab.add_banner("VS Code is ready", "Open VS Code", lambda: _open_uri(tab, link.url))
            if auto:
                _open_uri(tab, link.url)
        elif link.kind == links.LOCAL_WEB:
            def work():
                host = a.node if link.host in links.LOCAL_HOSTS else link.host
                try:
                    url = links.local_url(link, s.ssh.forward(host, link.port))
                except Exception as e:  # noqa: BLE001
                    _idle(tab.add_banner, f"Port forward failed: {e}")
                    return
                _idle(tab.add_banner, f"VS Code web is at {url}", "Open", lambda: _open_uri(tab, url))
                if auto:
                    _idle(_open_uri, tab, url)
            threading.Thread(target=work, daemon=True).start()

    def vscode_settings(self, s: ClusterSession, then_start: bool = False) -> None:
        if not self._ready(s):
            return
        self._aliases(s, lambda found: self._vscode_dialog(s, found, then_start))

    def _vscode_dialog(self, s: ClusterSession, aliases: dict[str, str], then_start: bool) -> None:
        v = s.cfg.vscode
        names = remote.vscode_candidates(aliases)
        if v.command and v.command not in names:
            names.insert(0, v.command)
        options = names + ["Custom command…"]

        dialog = Adw.PreferencesDialog(title=f"VS Code on {s.cfg.name}", search_enabled=False)
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(
            title="Start command",
            description="Found in your ~/.bashrc on the cluster. It runs on the compute node inside tmux."
            if names else "No VS Code alias found in ~/.bashrc. Type the command to run.")
        combo = Adw.ComboRow(title="Alias", model=Gtk.StringList.new(options))
        custom = Adw.EntryRow(title="Command")
        custom.set_text(v.command if v.command and v.command not in names else "")
        preview = Adw.ActionRow(title="Runs", subtitle_selectable=True, css_classes=["property"])
        combo.set_selected(names.index(v.command) if v.command in names else (0 if names else len(options) - 1))

        def chosen() -> str:
            i = combo.get_selected()
            return custom.get_text().strip() if i == len(options) - 1 else options[i]

        def sync(*_):
            is_custom = combo.get_selected() == len(options) - 1
            custom.set_visible(is_custom)
            body = aliases.get(chosen(), "")
            preview.set_subtitle(body if body and body != "(function)" else chosen() or "—")

        combo.connect("notify::selected", sync)
        custom.connect("changed", sync)
        sync()
        for row in (combo, custom, preview):
            group.add(row)

        more = Adw.PreferencesGroup(title="Options")
        workdir = Adw.EntryRow(title="Start in folder")
        workdir.set_text(v.workdir)
        open_links = Adw.SwitchRow(title="Open links automatically",
                                   subtitle="Tunnel / sign-in pages open in your browser", active=v.open_links)
        for row in (workdir, open_links):
            more.add(row)
        page.add(group)
        page.add(more)

        remote_group = Adw.PreferencesGroup(title="VS Code server settings")
        edit = Adw.ButtonRow(title="Edit remote settings.json", end_icon_name="document-edit-symbolic")
        edit.connect("activated", lambda *_: self.edit_remote(s, "~/.vscode-server/data/Machine/settings.json", "{\n}\n"))
        remote_group.add(edit)
        page.add(remote_group)
        dialog.add(page)

        def closed(*_):
            cmd = chosen()
            if not cmd:
                return
            v.command, v.workdir, v.open_links = cmd, workdir.get_text().strip() or "~", open_links.get_active()
            self.save_config()
            if then_start:
                self.vscode(s)

        dialog.connect("closed", closed)
        dialog.present(self.window)

    # -- Claude --------------------------------------------------------------------------
    def claude(self, s: ClusterSession) -> None:
        if not self._ready(s):
            return
        c = s.cfg.claude
        dialog = Adw.AlertDialog(heading=f"Run Claude on {s.cfg.name}")
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        skip = Gtk.CheckButton(label="--dangerously-skip-permissions", active=c.skip_permissions)
        new = Gtk.CheckButton(label="Use a new compute node", active=c.new_node)
        a = s.allocation
        same_hint = f"Unchecked: same node as now ({a.node}, job {a.job_id})" if a else "Unchecked: same node (requested if needed)"
        hint = Gtk.Label(label=same_hint, xalign=0, wrap=True, css_classes=["dim-label", "caption"])
        folder = Adw.EntryRow(title="Start in folder")
        folder.set_text(c.workdir)
        folder_box = Gtk.ListBox(css_classes=["boxed-list"], selection_mode=Gtk.SelectionMode.NONE)
        folder_box.append(folder)
        for w in (skip, new, hint, folder_box):
            box.append(w)
        dialog.set_extra_child(box)
        dialog.add_response("cancel", "Cancel")
        dialog.add_response("run", "Run Claude")
        dialog.set_response_appearance("run", Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response("run")

        def on_response(_d, response):
            if response != "run":
                return
            c.skip_permissions, c.new_node = skip.get_active(), new.get_active()
            c.workdir = folder.get_text().strip() or "~"
            self.save_config()
            self._check_claude(s)

        dialog.connect("response", on_response)
        dialog.present(self.window)

    def _check_claude(self, s: ClusterSession) -> None:
        self.toast(f"Checking claude on {s.cfg.name}…")

        def work():
            try:
                kind = remote.command_type(s.ssh, s.cfg.claude.command)
            except Exception:  # noqa: BLE001
                kind = ""
            _idle(self._claude_checked, s, kind)

        threading.Thread(target=work, daemon=True).start()

    def _claude_checked(self, s: ClusterSession, kind: str) -> None:
        if not kind:
            self._error("Claude not found",
                        f"'{s.cfg.claude.command}' is not on PATH or in ~/.bashrc on {s.cfg.name}.")
            return
        if s.cfg.claude.new_node:
            self.toast("Requesting a new node for Claude…")
            s.extra_node("hpc-hub-claude", lambda a, err: _idle(self._start_claude, s, a, err))
        else:
            s.ensure_node(lambda a: _idle(self._start_claude, s, a, ""))

    def _start_claude(self, s: ClusterSession, a: Allocation | None, err: str) -> None:
        if not a:
            self._error("No compute node", err or f"Could not get a node on {s.cfg.name}.")
            return
        c = s.cfg.claude
        cmd = c.command + (" --dangerously-skip-permissions" if c.skip_permissions else "")
        line = remote.in_tmux(f"hpchub-claude-{a.job_id}", remote.on_node(a.job_id, c.workdir, cmd))
        self.terminals.open(f"Claude · {s.cfg.name} · {a.node}", s.ssh.argv(line, tty=True),
                            "user-available-symbolic", node=a.node)
        self.show_terminals()

    # -- remote text edit (used by VS Code settings) -----------------------------------------
    def edit_remote(self, s: ClusterSession, path: str, template: str = "") -> None:
        from .editor import EditorDialog
        EditorDialog(s, path, template).present(self.window)
