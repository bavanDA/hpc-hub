"""The agents and Ask all on a compute node. Starting one answers the argv of a terminal tab, like
terminals.command. Getting a node can take a while: the call waits for it and reports in `tools-progress` events."""

import posixpath
import re
import shlex
import subprocess
import time
from concurrent.futures import Future
from dataclasses import asdict, replace

from ...agents import ask_all, catalog, chat_cache, permissions
from ...agents import chats as chat_store
from ...compute import slurm
from ...compute.limits import slurm_time
from ...compute.slurm import Allocation
from ...core import remote
from ...files import remote_fs
from ...terminals import tmux
from ..hub import hub
from ..server import method
from .clusters import _profile

CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
PROJECT_CHATS = 400  # a project's chats may be older than the newest few


def progress(cluster: str, text: str) -> None:
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
    """The node you have and your saved choices for VS Code and every agent."""
    s = hub().session(cluster)
    cfg, a = s.cfg, s.allocation
    v = cfg.vscode
    return {"id": cfg.id, "name": cfg.name, "connected": s.connected, "node": a.node if a else "",
            "job": a.job_id if a else "", "profile": asdict(cfg.profile),
            "vscode": {"workdir": v.workdir, "open_in": v.open_in, "open_links": v.open_links, "ask": v.ask,
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
    chat_cache.remember(_chats_key(cluster, agent, folder), found, {"home": home})
    return {"home": home, "chats": [{**asdict(c), "name": c.name} for c in found]}


def _chats_key(cluster: str, agent: str, folder: str) -> str:
    return f"{cluster}\n{agent}\n{folder.strip()}"


@method("tools.chats_cached")
def chats_cached(cluster: str, agent: str, folder: str = "") -> dict | None:
    """The list tools.chats gave last time, at once (no cluster needed); None the first time."""
    kept = chat_cache.recall(_chats_key(cluster, agent, folder))
    if not kept:
        return None
    found, extra = kept
    return {"home": extra.get("home", ""), "chats": [{**asdict(c), "name": c.name} for c in found], "cached": True}


@method("tools.installed")
def installed(cluster: str) -> list[str]:
    """The agents whose command an interactive shell on the cluster finds (PATH or ~/.bashrc)."""
    s = hub().connected(cluster)
    names = " ".join(shlex.quote(getattr(s.cfg, a.id).command or a.id) for a in catalog.AGENTS)
    line = f"for c in {names}; do type -t \"$c\" >/dev/null 2>&1 && echo \"$c\"; done"
    found = set(s.ssh.run(f"bash -ic {shlex.quote(line)} 2>/dev/null </dev/null", timeout=45).stdout.split())
    return [a.id for a in catalog.AGENTS if (getattr(s.cfg, a.id).command or a.id) in found]


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
    """Start (or resume chat_id) the agent in folder on a compute node; saves the choices first.
    profile: resources when a node gets requested."""
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

    progress(cluster, f"Checking {a.name} on {s.cfg.name}…")
    if not remote.command_type(s.ssh, c.command or a.id):
        raise RuntimeError(f"{a.name} not found: '{c.command}' is not on PATH or in ~/.bashrc on {s.cfg.name}")
    if c.new_node:
        progress(cluster, f"Requesting a new node for {a.name} ({(picked or s.cfg.profile).summary()})…")
    elif not s.allocation:
        progress(cluster, f"Requesting a compute node for {a.name}…")
    node = _node(s, picked, f"hpc-hub-{a.id}" if c.new_node else "")
    if a.remote_setting:  # remote control comes from the agent's settings, not a flag: set it first
        try:
            permissions.set_remote(s.ssh, a.remote_setting, c.remote)
        except OSError as e:
            progress(cluster, f"Could not set remote control: {e}")
    tag = chat_id[:8] if chat_id else time.strftime("%H%M%S")  # one tmux session per chat
    title = f"{a.name} · {label.strip() or posixpath.basename(folder.rstrip('/')) or folder}"
    line = catalog.command(a, c, chat_id, task)
    return _tab(s, node, f"hpchub-{a.id}-{node.job_id}-{tag}", line, folder, title,
                tmux.AGENT_COLORS.get(a.id, ""))


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
        progress(cluster, f"Requesting a compute node for Ask all ({(picked or s.cfg.profile).summary()})…")
    node = _node(s, picked)
    ask = ask_all.Ask(folder, out, prompt, [(a, getattr(s.cfg, a.id)) for a in picked_agents], bool(discuss))
    title = f"Ask all · {prompt.strip().splitlines()[0][:40]}"
    tab = _tab(s, node, f"hpchub-ask-{node.job_id}-{time.strftime('%H%M%S')}", ask_all.command(ask), folder, title,
               tmux.AGENT_COLORS["ask"])
    return {**tab, "out": out}
