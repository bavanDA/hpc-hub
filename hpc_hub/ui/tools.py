"""VS Code and Claude on the compute node: dialogs + launch into a terminal tab."""

import shlex
import shutil
import subprocess
import threading
import time
from collections.abc import Callable
from urllib.parse import urlsplit

from gi.repository import Adw, Gdk, GLib, Gtk

from .. import links, remote, remote_fs, slurm
from ..links import Link
from ..session import ClusterSession, State
from ..slurm import Allocation
from .claude_dialog import ClaudeDialog
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
        self.tunnels: dict[str, tuple[str, str]] = {}  # cluster -> (job id, tunnel name)
        self.pending: dict[str, tuple[str, str]] = {}  # cluster -> (folder, target) to open once the tunnel is up
        self.vs_tabs: dict[str, tuple[str, TerminalTab]] = {}

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
    def vscode(self, s: ClusterSession, folder: str = "", target: str = "") -> None:
        """Open folder in VS Code (desktop app or browser) through the tunnel of the VS Code batch job.
        Submits the job if none is running and follows its log."""
        if not self._ready(s):
            return
        v, cid = s.cfg.vscode, s.cfg.id
        target = target or v.open_in
        self.toast(f"Opening VS Code on {s.cfg.name}…")

        def work():
            try:
                where = folder or v.workdir
                if where.startswith("~"):
                    where = remote_fs.home(s.ssh) + where[1:]
                job = slurm.find_job(s.ssh, VSCODE_JOBS)
                known = self.tunnels.get(cid)
                if job and known and known[0] == job.job_id:
                    _idle(self._open_tunnel, known[1], where, target)
                    return
                self.pending[cid] = (where, target)
                if job:
                    job_id = job.job_id
                else:
                    body = "\n".join(x for x in (remote.cd_part(v.workdir), v.setup, v.command) if x.strip())
                    job_id = slurm.submit(s.ssh, v.compute, VSCODE_JOB, body)
                    _idle(self.toast, f"Submitted VS Code job {job_id}, it opens when the job starts")
            except (slurm.SlurmError, OSError, subprocess.SubprocessError, remote_fs.FsError) as e:
                _idle(self._error, "VS Code job failed", str(e))
                return
            _idle(self._follow_vscode, s, job_id)

        threading.Thread(target=work, daemon=True).start()

    def _follow_vscode(self, s: ClusterSession, job_id: str) -> None:
        tab = self.vs_tabs.get(s.cfg.id)
        if tab and tab[0] == job_id and tab[1].get_root():
            self.show_terminals()  # already following it; the link opens the pending folder
            return
        a = Allocation(job_id, "", owned=False)
        t = self.terminals.open(f"VS Code · {s.cfg.name} · job {job_id}", s.ssh.argv(slurm.follow_log(job_id), tty=True),
                                "text-editor-symbolic", on_link=lambda tab, link: self._vscode_link(s, a, tab, link))
        self.vs_tabs[s.cfg.id] = (job_id, t)
        self.show_terminals()

    def _open_tunnel(self, name: str, folder: str, target: str) -> None:
        desktop, browser = links.tunnel_urls(name, folder)
        if target == "desktop" and shutil.which("code"):
            subprocess.Popen(["code", "--folder-uri", desktop], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
            self.toast("Opening in VS Code. First time, sign in with GitHub in VS Code.")
        else:
            if target == "desktop":
                self.toast("VS Code app not found, opening in the browser")
            _open_uri(self.window, browser)

    def _vscode_link(self, s: ClusterSession, a: Allocation, tab: TerminalTab, link: Link) -> None:
        v = s.cfg.vscode
        if link.kind == links.DEVICE_LOGIN:
            if link.code:
                Gdk.Display.get_default().get_clipboard().set(link.code)
            tab.add_banner(f"Sign in with code {link.code} (copied)", "Open sign-in page",
                           lambda: _open_uri(tab, link.url))
            if v.open_links:
                _open_uri(tab, link.url)
        elif link.kind == links.TUNNEL:
            name = links.tunnel_name(link.url)
            if not name:
                return
            self.tunnels[s.cfg.id] = (a.job_id, name)
            where = urlsplit(link.url).path.split("/", 3)[3:] or [""]
            home = "/" + where[0]
            tab.add_banner(f"VS Code is ready (tunnel {name})", "Open in browser",
                           lambda: self._open_tunnel(name, home, "browser"))
            tab.add_banner("Open in the VS Code app", "Open app", lambda: self._open_tunnel(name, home, "desktop"))
            pending = self.pending.pop(s.cfg.id, None)
            if pending:
                self._open_tunnel(name, *pending)
            elif v.open_links:
                self._open_tunnel(name, home, v.open_in)
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
        ClaudeDialog(s, lambda folder, chat_id: self._check_claude(s, folder, chat_id), self.save_config).present(self.window)

    def _check_claude(self, s: ClusterSession, folder: str, chat_id: str) -> None:
        self.toast(f"Checking claude on {s.cfg.name}…")

        def work():
            try:
                kind = remote.command_type(s.ssh, s.cfg.claude.command)
            except Exception:  # noqa: BLE001
                kind = ""
            _idle(self._claude_checked, s, kind, folder, chat_id)

        threading.Thread(target=work, daemon=True).start()

    def _claude_checked(self, s: ClusterSession, kind: str, folder: str, chat_id: str) -> None:
        if not kind:
            self._error("Claude not found",
                        f"'{s.cfg.claude.command}' is not on PATH or in ~/.bashrc on {s.cfg.name}.")
            return
        start = lambda a, err: _idle(self._start_claude, s, a, err, folder, chat_id)  # noqa: E731
        if s.cfg.claude.new_node:
            self.toast("Requesting a new node for Claude…")
            s.extra_node("hpc-hub-claude", start)
        else:
            s.ensure_node(lambda a: start(a, ""))

    def _start_claude(self, s: ClusterSession, a: Allocation | None, err: str, folder: str, chat_id: str) -> None:
        if not a:
            self._error("No compute node", err or f"Could not get a node on {s.cfg.name}.")
            return
        c = s.cfg.claude
        cmd = c.command + (" --dangerously-skip-permissions" if c.skip_permissions else "")
        if chat_id:
            cmd += f" --resume {shlex.quote(chat_id)}"
        tag = chat_id[:8] if chat_id else time.strftime("%H%M%S")  # one tmux session per chat
        line = remote.in_tmux(f"hpchub-claude-{a.job_id}-{tag}", remote.on_node(a.job_id, folder, cmd))
        title = "Claude · " + (s.cfg.name if chat_id else f"{s.cfg.name} · new") + f" · {a.node}"
        self.terminals.open(title, s.ssh.argv(line, tty=True), "user-available-symbolic", node=a.node)
        self.show_terminals()

    # -- remote text edit (used by VS Code settings) -----------------------------------------
    def edit_remote(self, s: ClusterSession, path: str, template: str = "") -> None:
        from .editor import EditorDialog
        EditorDialog(s, path, template).present(self.window)
