"""VS Code, the agents (Claude, ChatGPT, Antigravity, Cursor) and Ask all on a compute node (hpc_hub/ui/tools.py).

Starting one answers the local command line (argv) for a terminal tab, like terminals.command; the UI runs it in a
PTY. Getting a node can take a while: the call waits for it, and says what it is doing in `tools-progress` events."""

import posixpath
import re
import shlex
import shutil
import subprocess
import time
from concurrent.futures import Future
from dataclasses import asdict, replace

from ...agents import ask_all, catalog, permissions
from ...agents import chats as chat_store
from ...compute import slurm
from ...compute.limits import slurm_time
from ...compute.slurm import Allocation
from ...core import remote
from ...files import remote_fs
from ...terminals import links, tmux
from ..hub import hub
from ..server import method
from .clusters import _profile

VSCODE_JOB = "hpc-hub-vscode"
VSCODE_JOBS = [VSCODE_JOB, "vscode", "vs-code", "vscode_slurm.sh"]  # also your own scripts' jobs
TARGETS = ("desktop", "browser")
CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
TUNNEL = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
PROJECT_CHATS = 400  # a project's chats may be older than the newest few


def _progress(cluster: str, text: str) -> None:
    hub().emit("tools-progress", {"cluster": cluster, "text": text})


def _agent(agent: str) -> catalog.Agent:
    if agent not in catalog.BY_ID:
        raise ValueError(f"No agent {agent}")
    return catalog.BY_ID[agent]


def _base_profile(cfg, c) -> dict:
    """The agent's own node choice, else the cluster's (older configs kept only minutes)."""
    if c.compute.cpus:
        return asdict(c.compute)
    return asdict(replace(cfg.profile, time=slurm_time(c.minutes)) if c.minutes else cfg.profile)


def _agent_json(cfg, a: catalog.Agent) -> dict:
    c = getattr(cfg, a.id)
    return {"id": a.id, "name": a.name, "remote_label": a.remote_label, "remote_hint": a.remote_hint,
            "options": [{"key": o.key, "label": o.label, "choices": [list(x) for x in o.choices]} for o in a.options],
            "settings": {"command": c.command, "workdir": c.workdir, "new_node": c.new_node, "remote": c.remote,
                         **{o.key: getattr(c, o.key) for o in a.options}},
            "profile": _base_profile(cfg, c)}


@method("tools.setup")
def setup(cluster: str) -> dict:
    """What the dialogs start from: the node you have, your saved choices for VS Code and every agent."""
    s = hub().session(cluster)
    cfg, a = s.cfg, s.allocation
    v = cfg.vscode
    return {"id": cfg.id, "name": cfg.name, "connected": s.connected, "node": a.node if a else "",
            "job": a.job_id if a else "", "profile": asdict(cfg.profile),
            "vscode": {"workdir": v.workdir, "open_in": v.open_in, "open_links": v.open_links,
                       "profile": asdict(v.compute)},
            "agents": [_agent_json(cfg, x) for x in catalog.AGENTS]}


def _real(s, folder: str) -> str:
    """The folder with links resolved (/scratch is a link to /mmfs1/scratch on Wulver)."""
    res = s.ssh.run(f"readlink -f {remote_fs.q(remote_fs.expand(s.ssh, folder))}", timeout=30)
    return res.stdout.strip().rstrip("/")


@method("tools.chats")
def chats(cluster: str, agent: str, folder: str = "") -> dict:
    """Past chats of the agent, newest first; with folder, only the ones that ran in it (or below)."""
    s = hub().connected(cluster)
    _agent(agent)
    found = chat_store.list_chats(s.ssh, agent, PROJECT_CHATS if folder else chat_store.LIMIT)
    home = remote_fs.home(s.ssh)
    if folder.strip():
        top = folder.strip().rstrip("/") or "/"
        roots = {remote_fs.expand(s.ssh, top), _real(s, top)} - {""}
        found = [c for c in found if any(c.cwd == r or c.cwd.startswith(r.rstrip("/") + "/") for r in roots)]
    return {"home": home, "chats": [{**asdict(c), "name": c.name} for c in found]}


@method("tools.installed")
def installed(cluster: str) -> list[str]:
    """The agents whose command an interactive shell on the cluster finds (PATH or ~/.bashrc)."""
    s = hub().connected(cluster)
    names = " ".join(shlex.quote(getattr(s.cfg, a.id).command or a.id) for a in catalog.AGENTS)
    line = f"for c in {names}; do type -t \"$c\" >/dev/null 2>&1 && echo \"$c\"; done"
    found = set(s.ssh.run(f"bash -ic {shlex.quote(line)} 2>/dev/null </dev/null", timeout=45).stdout.split())
    return [a.id for a in catalog.AGENTS if (getattr(s.cfg, a.id).command or a.id) in found]


# -- compute nodes --------------------------------------------------------------------------------
def _with_node(s, a: Allocation | None) -> Allocation | None:
    """Fill in the job's node (tmux runs there)."""
    if a and not a.node:
        try:
            a.node = slurm.node_of(s.ssh, a.job_id)
        except (OSError, subprocess.SubprocessError, slurm.SlurmError):
            pass
    return a


def _node(s, profile, new_job: str = ""):
    """Wait for the session's node (asked for with profile if there is none), or a new one named new_job."""
    done: Future = Future()
    if new_job:
        s.extra_node(new_job, lambda a, err: done.set_result((a, err)), profile)
    else:
        s.ensure_node(lambda a: done.set_result((a, "")), profile)
    a, err = done.result()
    a = _with_node(s, a)
    if not a or not a.node:
        raise RuntimeError(err or f"Could not get a compute node on {s.cfg.name}")
    return a


def _tab(s, a: Allocation, name: str, cmd: str, folder: str, title: str, color: str) -> dict:
    line = tmux.open_line(name, remote.node_shell(folder, cmd), title, color, node=a.node)
    return {"argv": s.ssh.argv(line, tty=True), "name": name, "node": a.node, "title": title, "color": color}


# -- agents -----------------------------------------------------------------------------------------
def _set_options(a: catalog.Agent, c, options: dict) -> None:
    for o in a.options:
        if o.key in options:
            value = str(options[o.key])
            if value not in {v for v, _ in o.choices}:
                raise ValueError(f"{a.name} has no {o.label} {value}")
            setattr(c, o.key, value)


@method("tools.agent_start")
def agent_start(cluster: str, agent: str, folder: str = "", chat_id: str = "", label: str = "", task: str = "",
                options: dict | None = None, new_node: bool | None = None, remote_control: bool | None = None,
                profile: dict | None = None) -> dict:
    """Start (or resume chat_id) the agent in folder on a compute node and answer the tab's command line.
    Saves the choices first, like the GTK dialog. profile: resources when a node gets requested."""
    s = hub().connected(cluster)
    a = _agent(agent)
    c = getattr(s.cfg, a.id)
    if chat_id and not CHAT_ID.match(chat_id):
        raise ValueError("That chat id looks wrong")
    folder = folder.strip() or "~"
    picked = _profile(c.compute if c.compute.cpus else s.cfg.profile, profile) if profile else None
    _set_options(a, c, options or {})
    if new_node is not None:
        c.new_node = bool(new_node)
    if remote_control is not None:
        c.remote = bool(remote_control)
    if picked:
        c.compute = picked
    if not chat_id:
        c.workdir = folder
    hub().save_clusters()

    _progress(cluster, f"Checking {a.name} on {s.cfg.name}…")
    if not remote.command_type(s.ssh, c.command or a.id):
        raise RuntimeError(f"{a.name} not found: '{c.command}' is not on PATH or in ~/.bashrc on {s.cfg.name}")
    if c.new_node:
        _progress(cluster, f"Requesting a new node for {a.name} ({(picked or s.cfg.profile).summary()})…")
    elif not s.allocation:
        _progress(cluster, f"Requesting a compute node for {a.name}…")
    node = _node(s, picked, f"hpc-hub-{a.id}" if c.new_node else "")
    if a.remote_setting:  # remote control comes from the agent's settings, not a flag: set it first
        try:
            permissions.set_key(s.ssh, a.remote_setting, c.remote)
        except OSError as e:
            _progress(cluster, f"Could not set remote control: {e}")
    tag = chat_id[:8] if chat_id else time.strftime("%H%M%S")  # one tmux session per chat
    title = f"{a.name} · {label.strip() or posixpath.basename(folder.rstrip('/')) or folder}"
    return _tab(s, node, f"hpchub-{a.id}-{node.job_id}-{tag}", catalog.command(a, c, chat_id, task), folder, title,
                tmux.AGENT_COLORS.get(a.id, ""))


# -- Ask all ----------------------------------------------------------------------------------------
@method("tools.ask_start")
def ask_start(cluster: str, folder: str, out: str, prompt: str, agents: list[str], discuss: bool = False,
              profile: dict | None = None, remember: bool = False) -> dict:
    """One prompt to every agent picked (agents: ids); answers go to out. Waits for the node."""
    s = hub().connected(cluster)
    if not prompt.strip():
        raise ValueError("Write a prompt first")
    picked_agents = [_agent(x) for x in agents]
    if not picked_agents:
        raise ValueError("Pick at least one agent")
    folder, out = folder.strip() or "~", out.strip()
    if not out:
        raise ValueError("Say where the answers go")
    picked = _profile(s.cfg.profile, profile) if profile else None
    if picked and remember:
        s.cfg.profile = picked
        hub().save_clusters()
    if not s.allocation:
        _progress(cluster, f"Requesting a compute node for Ask all ({(picked or s.cfg.profile).summary()})…")
    node = _node(s, picked)
    ask = ask_all.Ask(folder, out, prompt, [(a, getattr(s.cfg, a.id)) for a in picked_agents], bool(discuss))
    title = f"Ask all · {prompt.strip().splitlines()[0][:40]}"
    tab = _tab(s, node, f"hpchub-ask-{node.job_id}-{time.strftime('%H%M%S')}", ask_all.command(ask), folder, title,
               tmux.AGENT_COLORS["ask"])
    return {**tab, "out": out}


# -- VS Code ----------------------------------------------------------------------------------------
@method("tools.vscode_find")
def vscode_find(cluster: str) -> dict:
    """Your VS Code job if one is pending or running, and its tunnel once it printed one."""
    s = hub().connected(cluster)
    job = slurm.find_job(s.ssh, VSCODE_JOBS)
    if not job:
        return {"job": None, "tunnel": ""}
    found = {"id": job.job_id, "node": job.node, "name": job.name, "resources": slurm.resources(s.ssh, job.job_id)}
    return {"job": found, "tunnel": links.tunnel_name(slurm.tunnel_link(s.ssh, job.job_id))}


def _follow(s, job_id: str) -> dict:
    return {"argv": s.ssh.argv(slurm.follow_log(job_id), tty=True), "job": job_id,
            "title": f"VS Code · {s.cfg.name} · job {job_id}", "color": tmux.AGENT_COLORS["vscode"]}


@method("tools.vscode_start")
def vscode_start(cluster: str, folder: str = "", target: str = "", job: str = "", replace_job: bool = False,
                 profile: dict | None = None, remember: bool = False, remember_folder: bool = False) -> dict:
    """Open folder in VS Code through the VS Code job's tunnel. job: the running one to use (with its tunnel
    known: {"open": ...} from vscode_open), or to stop first (replace_job). With none, submits one; then
    {"follow": ...} is the command line that shows its log, where the tunnel link appears."""
    s = hub().connected(cluster)
    v = s.cfg.vscode
    target = target or v.open_in
    if target not in TARGETS:
        raise ValueError(f"Open in {target}?")
    picked = _profile(v.compute, profile) if profile else v.compute
    where = remote_fs.expand(s.ssh, folder.strip() or v.workdir)
    if remember:
        v.open_in = target
        if not job or replace_job:
            v.compute = picked
        if remember_folder:
            v.workdir = folder.strip() or v.workdir
        hub().save_clusters()
    if job and not replace_job:
        if not job.isdigit():
            raise ValueError("That job id looks wrong")
        tunnel = links.tunnel_name(slurm.tunnel_link(s.ssh, job))
        if tunnel:
            return {"open": vscode_open(tunnel, where, target), "folder": where, "target": target}
        return {"follow": _follow(s, job), "folder": where, "target": target}
    if job:
        _progress(cluster, f"Stopping VS Code job {job}…")
        slurm.cancel(s.ssh, job)
    body = "\n".join(x for x in (remote.cd_part(v.workdir), v.setup, v.command) if x.strip())
    job_id = slurm.submit(s.ssh, s.fit(picked), VSCODE_JOB, body)
    s._log(f"Submitted VS Code job {job_id}")
    return {"follow": _follow(s, job_id), "folder": where, "target": target, "submitted": job_id}


@method("tools.vscode_open")
def vscode_open(tunnel: str, folder: str = "", target: str = "desktop") -> dict:
    """Open the folder on that tunnel: in the VS Code app (when it is installed here) or in the browser.
    {"app": true}, or {"app": false, "url": ..., "missing": true if you wanted the app}."""
    if not TUNNEL.match(tunnel):
        raise ValueError("That tunnel name looks wrong")
    desktop, browser = links.tunnel_urls(tunnel, folder)
    if target == "desktop" and shutil.which("code"):
        subprocess.Popen(["code", "--folder-uri", desktop], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
        return {"app": True, "url": desktop, "missing": False}
    return {"app": False, "url": browser, "missing": target == "desktop"}


@method("tools.forward")
def forward(cluster: str, url: str, job: str = "", node: str = "") -> str:
    """A web server the VS Code job printed (code serve-web): forward its port here, answer the local link."""
    s = hub().connected(cluster)
    link = links.classify(url, node=node)
    if link.kind != links.LOCAL_WEB:
        raise ValueError("Not a link on the node")
    if not node and job.isdigit():
        node = slurm.node_of(s.ssh, job)
    host = node if link.host in links.LOCAL_HOSTS else link.host
    if not host:
        raise RuntimeError("No node for that link")
    return links.local_url(link, s.ssh.forward(host, link.port))

