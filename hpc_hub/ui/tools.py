"""VS Code and Claude on the compute node: dialogs + launch into a terminal tab."""

import subprocess
import threading
from collections.abc import Callable

from gi.repository import Adw, Gdk, GLib, Gtk

from .. import links, remote, slurm
from ..links import Link
from ..session import ClusterSession, State
from ..slurm import Allocation
from .terminals import TerminalsPage, TerminalTab


VSCODE_JOB = "hpc-hub-vscode"
VSCODE_JOBS = [VSCODE_JOB, "vscode", "vs-code", "vscode_slurm.sh"]  # also your own scripts' jobs


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

    def _ready(self, s: ClusterSession) -> bool:
        if s.state != State.CONNECTED or not s.ssh:
            self.toast(f"Connect to {s.cfg.name} first")
            return False
        return True

    def _error(self, heading: str, body: str) -> None:
        d = Adw.AlertDialog(heading=heading, body=body)
        d.add_response("ok", "OK")
        d.present(self.window)

    # -- VS Code -------------------------------------------------------------------
    def vscode(self, s: ClusterSession) -> None:
        """Submit the VS Code batch job (or find the running one) and follow its log."""
        if not self._ready(s):
            return
        self.toast(f"Starting VS Code on {s.cfg.name}…")
        v = s.cfg.vscode

        def work():
            try:
                job = slurm.find_job(s.ssh, VSCODE_JOBS)
                if job:
                    _idle(self.toast, f"VS Code job {job.job_id} is already there, opening it")
                    job_id = job.job_id
                else:
                    body = "\n".join(x for x in (remote.cd_part(v.workdir), v.setup, v.command) if x.strip())
                    job_id = slurm.submit(s.ssh, v.compute, VSCODE_JOB, body)
                    _idle(self.toast, f"Submitted VS Code job {job_id}")
            except (slurm.SlurmError, OSError, subprocess.SubprocessError) as e:
                _idle(self._error, "VS Code job failed", str(e))
                return
            _idle(self._follow_vscode, s, job_id)

        threading.Thread(target=work, daemon=True).start()

    def _follow_vscode(self, s: ClusterSession, job_id: str) -> None:
        a = Allocation(job_id, "", owned=False)
        self.terminals.open(f"VS Code · {s.cfg.name} · job {job_id}", s.ssh.argv(slurm.follow_log(job_id), tty=True),
                            "text-editor-symbolic", on_link=lambda tab, link: self._vscode_link(s, a, tab, link))
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
                try:
                    a.node = a.node or slurm.node_of(s.ssh, a.job_id)
                    host = a.node if link.host in links.LOCAL_HOSTS else link.host
                    url = links.local_url(link, s.ssh.forward(host, link.port))
                except Exception as e:  # noqa: BLE001
                    _idle(tab.add_banner, f"Port forward failed: {e}")
                    return
                _idle(tab.add_banner, f"VS Code web is at {url}", "Open", lambda: _open_uri(tab, url))
                if auto:
                    _idle(_open_uri, tab, url)
            threading.Thread(target=work, daemon=True).start()

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
