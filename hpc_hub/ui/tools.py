"""VS Code and Claude on the compute node: dialogs + launch into a terminal tab."""

import posixpath
import shutil
import subprocess
import threading
import time
from collections.abc import Callable
from urllib.parse import urlsplit

from gi.repository import Adw, Gdk, GLib, Gtk

from .. import agents, ask_all, links, permissions, remote, remote_fs, slurm, tmux
from ..agents import Agent
from ..limits import human
from ..links import Link
from ..session import ClusterSession
from ..slurm import Allocation
from .agent_dialog import AgentDialog, Launch
from .ask_all import AskAllDialog
from .terminals import TerminalsPage, TerminalTab
from .widgets import bg, open_uri


VSCODE_JOB = "hpc-hub-vscode"
VSCODE_JOBS = [VSCODE_JOB, "vscode", "vs-code", "vscode_slurm.sh"]  # also your own scripts' jobs


def _idle(fn, *args):
    GLib.idle_add(lambda: fn(*args) and False)


def _device_login(tab: TerminalTab, link: Link) -> None:
    if link.code:
        Gdk.Display.get_default().get_clipboard().set(link.code)
    tab.add_banner(f"Sign in with code {link.code} (copied)", "Open sign-in page", lambda: open_uri(tab, link.url))


class Tools:
    def __init__(self, window: Gtk.Window, terminals: TerminalsPage, show_terminals: Callable[[], None],
                 toast: Callable[[str], None], save_config: Callable[[], None]):
        self.window = window
        self.terminals = terminals
        self.show_terminals = show_terminals
        self.toast = toast
        self.save_config = save_config
        self.open_files: Callable[[ClusterSession, str], None] | None = None  # set by the app
        self.tunnels: dict[str, tuple[str, str]] = {}  # cluster -> (job id, tunnel name)
        self.pending: dict[str, tuple[str, str]] = {}  # cluster -> (folder, target) to open once the tunnel is up
        self.vs_tabs: dict[str, tuple[str, TerminalTab]] = {}

    def _ready(self, s: ClusterSession) -> bool:
        if not s.connected:
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
                where = remote_fs.expand(s.ssh, folder or v.workdir)
                job = slurm.find_job(s.ssh, VSCODE_JOBS)
                known = self.tunnels.get(cid)
                if job and not (known and known[0] == job.job_id):
                    name = links.tunnel_name(slurm.tunnel_link(s.ssh, job.job_id))  # e.g. after an app restart
                    known = self.tunnels[cid] = (job.job_id, name) if name else None
                if job and known:
                    _idle(self._open_tunnel, known[1], where, target)
                    return
                self.pending[cid] = (where, target)
                if job:
                    job_id = job.job_id
                else:
                    body = "\n".join(x for x in (remote.cd_part(v.workdir), v.setup, v.command) if x.strip())
                    job_id = slurm.submit(s.ssh, s.fit(v.compute), VSCODE_JOB, body)
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
            open_uri(self.window, browser)

    def _vscode_link(self, s: ClusterSession, a: Allocation, tab: TerminalTab, link: Link) -> None:
        v = s.cfg.vscode
        if link.kind == links.DEVICE_LOGIN:
            _device_login(tab, link)
            if v.open_links:
                open_uri(tab, link.url)
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
                a.node = a.node or slurm.node_of(s.ssh, a.job_id)
                host = a.node if link.host in links.LOCAL_HOSTS else link.host
                return links.local_url(link, s.ssh.forward(host, link.port))

            def done(url, err):
                if err:
                    tab.add_banner(f"Port forward failed: {err}")
                    return
                tab.add_banner(f"VS Code web is at {url}", "Open", lambda: open_uri(tab, url))
                if v.open_links:
                    open_uri(tab, url)
            bg(work, done)

    # -- Claude, ChatGPT, Antigravity ------------------------------------------------------
    def agent(self, s: ClusterSession, agent_id: str, folder: str = "") -> None:
        """folder: a project; its chats are listed and a new chat starts there."""
        if not self._ready(s):
            return
        agent = agents.BY_ID[agent_id]
        AgentDialog(agent, s, lambda run: self._check_agent(s, agent, run), self.save_config, folder).present(
            self.window)

    def _check_agent(self, s: ClusterSession, agent: Agent, run: Launch) -> None:
        c = getattr(s.cfg, agent.id)
        self.toast(f"Checking {agent.name} on {s.cfg.name}…")
        bg(lambda: remote.command_type(s.ssh, c.command),
           lambda kind, _err: self._agent_checked(s, agent, kind or "", run))

    def _agent_checked(self, s: ClusterSession, agent: Agent, kind: str, run: Launch) -> None:
        c = getattr(s.cfg, agent.id)
        if not kind:
            self._error(f"{agent.name} not found",
                        f"'{c.command}' is not on PATH or in ~/.bashrc on {s.cfg.name}.")
            return
        start = lambda a, err: _idle(self._start_agent, s, agent, a, err, run)  # noqa: E731
        if c.new_node:
            for_time = f" for {human(run.minutes)}" if run.minutes else ""
            self.toast(f"Requesting a new node for {agent.name}{for_time}…")
            s.extra_node(f"hpc-hub-{agent.id}", start, run.minutes)
        else:
            s.ensure_node(lambda a: start(a, ""))

    def _start_agent(self, s: ClusterSession, agent: Agent, a: Allocation | None, err: str, run: Launch) -> None:
        if not a:
            self._error("No compute node", err or f"Could not get a node on {s.cfg.name}.")
            return
        if agent.remote_setting:  # remote control comes from the agent's settings, not a flag: set it first
            on = getattr(s.cfg, agent.id).remote
            bg(lambda: permissions.set_key(s.ssh, agent.remote_setting, on),
               lambda _r, e: (e and self.toast(f"Could not set remote control: {e}"), self._open_agent(s, agent, a, run)))
            return
        self._open_agent(s, agent, a, run)

    def _open_agent(self, s: ClusterSession, agent: Agent, a: Allocation, run: Launch) -> None:
        folder, chat_id = run.folder, run.chat_id
        cmd = agents.command(agent, getattr(s.cfg, agent.id), chat_id, run.task)
        tag = chat_id[:8] if chat_id else time.strftime("%H%M%S")  # one tmux session per chat
        name = f"hpchub-{agent.id}-{a.job_id}-{tag}"
        title = f"{agent.name} · {run.label or posixpath.basename(folder.rstrip('/')) or folder}"
        color = tmux.AGENT_COLORS.get(agent.id, "")
        line = tmux.open_line(name, remote.on_node(a.job_id, folder, cmd), title, color)
        self.terminals.open(title, s.ssh.argv(line, tty=True), agent.icon, node=a.node, key=(s.cfg.id, name),
                            color=color, on_link=lambda tab, link: self._agent_link(agent, tab, link))
        self.show_terminals()

    def _agent_link(self, agent: Agent, tab: TerminalTab, link: Link) -> None:
        if link.kind == links.REMOTE:
            tab.add_banner(f"{agent.name} remote control is on", "Open", lambda: open_uri(tab, link.url))
        elif link.kind == links.PAIR:
            Gdk.Display.get_default().get_clipboard().set(link.code)
            tab.add_banner(f"ChatGPT pairing code {link.code} (copied). In the ChatGPT app: Codex, connect a "
                           "machine, enter the code. It expires in about 10 minutes.")
        elif link.kind == links.DEVICE_LOGIN:
            _device_login(tab, link)

    # -- Ask all ---------------------------------------------------------------------------
    def ask_all(self, s: ClusterSession, folder: str = "") -> None:
        if not self._ready(s):
            return
        AskAllDialog(s, lambda *args: self._start_ask(s, *args), folder).present(self.window)

    def _start_ask(self, s: ClusterSession, folder: str, out: str, prompt: str, picked: list[Agent],
                   discuss: bool) -> None:
        ask = ask_all.Ask(folder, out, prompt, [(a, getattr(s.cfg, a.id)) for a in picked], discuss)
        self.toast(f"Asking {len(picked)} agents on {s.cfg.name}…")

        def start(a: Allocation | None) -> None:
            if not a:
                self._error("No compute node", f"Could not get a node on {s.cfg.name}.")
                return
            name = f"hpchub-ask-{a.job_id}-{time.strftime('%H%M%S')}"
            title = f"Ask all · {prompt.strip().splitlines()[0][:40]}"
            color = tmux.AGENT_COLORS["ask"]
            line = tmux.open_line(name, remote.on_node(a.job_id, folder, ask_all.command(ask)), title, color)
            tab = self.terminals.open(title, s.ssh.argv(line, tty=True), "system-users-symbolic", node=a.node,
                                      key=(s.cfg.id, name), color=color)
            if self.open_files:
                tab.add_banner(f"Answers go to {out}", "Open folder", lambda: self.open_files(s, out))
            self.show_terminals()
            self.toast(f"Answers go to {out}")

        s.ensure_node(lambda a: _idle(start, a))

    # -- remote text edit (used by VS Code settings) -----------------------------------------
    def edit_remote(self, s: ClusterSession, path: str, template: str = "") -> None:
        from .editor import EditorDialog
        EditorDialog(s, path, template).present(self.window)
