"""Terminals: tmux sessions on each cluster, and the local ssh command line that attaches one in a PTY
(run by the Tauri side, see app/src-tauri/src/pty.rs)."""

import shlex
import time
import webbrowser
from dataclasses import asdict

from ...core import remote
from ...terminals import links, tmux
from ..hub import hub
from ..server import method


def _session_json(t: tmux.Session) -> dict:
    return {**asdict(t), "title": t.title, "agent": t.agent, "job": t.job,
            "color": t.color or tmux.AGENT_COLORS.get(t.agent, "")}


def _target(session: str, node: str = "", kind: str = "tmux") -> tmux.Session:
    """The session as the list gave it: its name, the node its tmux runs on, tmux or screen."""
    if kind not in ("tmux", "screen"):
        raise ValueError(f"Unknown session kind {kind}")
    return tmux.Session(session, kind=kind, node=node)


@method("terminals.list")
def sessions(cluster: str) -> dict:
    """tmux (and screen) sessions on the cluster and on your running jobs' nodes."""
    listing = tmux.list_sessions(hub().connected(cluster).ssh)
    return {"host": listing.host, "has_tmux": listing.has_tmux, "nodes": listing.nodes,
            "sessions": [_session_json(t) for t in listing.sessions]}


@method("terminals.command")
def command(cluster: str, session: str | None = None, node: str = "", kind: str = "tmux",
            new: dict | None = None) -> dict:
    """The local command line (argv) for a PTY: attach to session, or start a new terminal from
    new = {name, node (true: the compute node), folder, color}."""
    s = hub().connected(cluster)
    if session:
        t = _target(session, node, kind)
        return {"argv": s.ssh.argv(tmux.attach(t), tty=True), "name": t.name, "node": t.node}
    new = new or {}
    a = s.allocation
    if new.get("node") and not (a and a.node):
        raise RuntimeError("No compute node right now. Get one on the cluster card")
    where = a.node if new.get("node") and a else ""
    name = f"hpchub-term-{time.strftime('%m%d-%H%M%S')}"
    label, color = (new.get("name") or "Terminal").strip(), new.get("color") or ""
    cmd = f"bash -c {shlex.quote(remote.cd_part(new.get('folder') or '~') + '; exec bash -l')}"
    line = tmux.open_line(name, cmd, label, color, node=where)
    return {"argv": s.ssh.argv(line, tty=True), "name": name, "node": where, "title": label, "color": color}


@method("terminals.rename")
def rename(cluster: str, session: str, label: str, node: str = "", kind: str = "tmux") -> None:
    if not label.strip():
        raise ValueError("Give it a name")
    tmux.run(hub().connected(cluster).ssh, tmux.set_label(_target(session, node, kind), label.strip()))


@method("terminals.set_color")
def set_color(cluster: str, session: str, color: str, node: str = "") -> None:
    if color not in tmux.COLORS:
        raise ValueError(f"Unknown color {color}")
    tmux.run(hub().connected(cluster).ssh, tmux.set_color(_target(session, node), color))


@method("terminals.stop")
def stop(cluster: str, session: str, node: str = "", kind: str = "tmux") -> None:
    """Ends the session and everything running in it."""
    tmux.run(hub().connected(cluster).ssh, tmux.kill(_target(session, node, kind)))


@method("terminals.buffer")
def buffer(cluster: str, node: str = "") -> str:
    """tmux's copy buffer: what a mouse drag inside tmux copied."""
    return hub().connected(cluster).ssh.run(tmux.save_buffer(node), timeout=15).stdout.rstrip("\n")


@method("terminals.links")
def links_in(text: str, node: str = "") -> list[dict]:
    """Useful links in terminal output: VS Code tunnels, device sign-ins, remote control, pairing codes."""
    out = []
    for link in links.find_links(text, node):
        item = asdict(link)
        if link.kind == links.TUNNEL:
            item["tunnel"] = links.tunnel_name(link.url)
        out.append(item)
    return out


@method("terminals.open_link")
def open_link(url: str) -> None:
    """Open a link from a terminal in your browser."""
    if not url.startswith(("https://", "http://127.0.0.1:", "http://localhost:")):
        raise ValueError("Only web links open from here")
    webbrowser.open(url)
