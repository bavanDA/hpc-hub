"""Persistent terminals on a cluster: tmux (and screen) sessions you can leave and come back to.

Agent sessions run tmux on the compute node itself, reached with ssh from the login node: Slurm puts
them in your job, so they last as long as the job and nothing stays behind on the login node.
Labels and colors live in the tmux session itself (@hpchub_label, @hpchub_color), so they
survive app restarts and show up from any laptop.
"""

import re
import shlex
import time
from dataclasses import dataclass

from ..core.ssh import SshMaster
from . import links

MARK = "@@HPCHUB_PANE "

SEP = "\x1f"
FIELDS = ["session_name", "session_created", "session_attached", "@hpchub_label", "@hpchub_color",
          "pane_current_command", "session_windows", "pane_current_path", "@hpchub_remote"]
NODE_SSH = "ssh -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR"
NODE_MARK = "@@NODE "
_LS = f"tmux list-sessions -F {shlex.quote(SEP.join('#{' + f + '}' for f in FIELDS))} 2>/dev/null"
LIST = ("hostname; command -v tmux >/dev/null && echo TMUX_OK; "
        f"{_LS}; "
        "echo SCREEN_LIST; screen -ls 2>/dev/null; "
        'echo JOB_LIST; squeue -h -u "$USER" -t RUNNING -o "%i %N" 2>/dev/null; '
        'echo NODE_LIST; for n in $(squeue -h -u "$USER" -t RUNNING -o %N 2>/dev/null | '
        "xargs -r -n1 scontrol show hostnames 2>/dev/null | sort -u); do "
        f'echo "{NODE_MARK}$n"; {NODE_SSH} "$n" {shlex.quote(_LS)} </dev/null; done')
SCREEN_RE = re.compile(r"^\s+(\d+)\.(\S+)\s+\((?:\d.*?\)\s+\()?(Attached|Detached)\)", re.M)
COLORS = ["#3584e4", "#2ec27e", "#e5a50a", "#ff7800", "#e01b24", "#9141ac", "#986a44", "#77767b"]
AGENT_COLORS = {"claude": "#d97757", "codex": "#10a37f", "agy": "#4285f4", "cursor": "#8b8b8b",
                "ask": "#9141ac", "vscode": "#3584e4"}


@dataclass
class Session:
    name: str
    kind: str = "tmux"  # tmux or screen
    created: int = 0
    attached: int = 0
    label: str = ""
    color: str = ""
    command: str = ""
    windows: int = 1
    path: str = ""
    remote: str = ""  # remote control link, or "code:XXXX-XXXX" (ChatGPT pairing), found in its output
    node: str = ""  # compute node its tmux runs on; "" = the login node

    @property
    def title(self) -> str:
        return self.label or self.name

    @property
    def agent(self) -> str:
        """claude / codex / agy / term / "" from our hpchub-<kind>-... names."""
        m = re.match(r"hpchub-([a-z]+)-", self.name)
        return m.group(1) if m else ""

    @property
    def job(self) -> str:
        """Slurm job the agent runs in, from hpchub-<agent>-<job>-<tag>."""
        m = re.match(r"hpchub-[a-z]+-(\d+)-", self.name)
        return m.group(1) if m else ""


@dataclass
class Listing:
    host: str
    has_tmux: bool
    sessions: list[Session]
    nodes: dict[str, str] | None = None  # running job id -> node; None if squeue gave nothing


def _session(line: str, node: str = "") -> Session:
    p = (line.split(SEP) + [""] * len(FIELDS))[:len(FIELDS)]
    return Session(p[0], "tmux", _int(p[1]), _int(p[2]), p[3], p[4], p[5], _int(p[6]) or 1, p[7], p[8], node)


def parse(text: str) -> Listing:
    text, _, node_part = text.partition("NODE_LIST\n")
    lines = text.splitlines()
    host = lines[0].strip() if lines else ""
    has_tmux = "TMUX_OK" in lines[:3]
    out: list[Session] = []
    in_screen = False
    for line in lines[1:]:
        if line == "SCREEN_LIST":
            in_screen = True
            continue
        if not in_screen and SEP in line:
            out.append(_session(line))
    node = ""
    for line in node_part.splitlines():
        if line.startswith(NODE_MARK):
            node = line[len(NODE_MARK):].strip()
        elif node and SEP in line:
            out.append(_session(line, node))
    text, found, job_part = text.partition("JOB_LIST\n")
    nodes = dict(line.split()[:2] for line in job_part.splitlines() if len(line.split()) >= 2) if found else None
    screen_part = text.split("SCREEN_LIST", 1)[1] if "SCREEN_LIST" in text else ""
    for m in SCREEN_RE.finditer(screen_part):
        out.append(Session(f"{m.group(1)}.{m.group(2)}", "screen", attached=int(m.group(3) == "Attached"),
                           label=m.group(2)))
    out.sort(key=lambda s: (s.kind != "tmux", -s.created, s.name))
    return Listing(host, has_tmux, out, nodes)


def _int(v: str) -> int:
    try:
        return int(v)
    except ValueError:
        return 0


def _t(name: str) -> str:
    return shlex.quote(f"={name}")  # exact name, no prefix matching


def _opt(name: str) -> str:
    return shlex.quote(f"={name}:")  # set-option wants a pane-style target


def on(node: str, line: str, tty: bool = False) -> str:
    """Run line on a compute node (ssh from the login node), or right here when node is ""."""
    if not node:
        return line
    return f"{NODE_SSH}{' -t' if tty else ''} {shlex.quote(node)} {shlex.quote(line)}"


def create(name: str, command: str, label: str = "", color: str = "", cwd: str = "") -> str:
    """Start a detached session unless it exists, then tag it. Shell line."""
    q = shlex.quote(name)
    new = f"tmux new-session -d -s {q}" + (f" -c {shlex.quote(cwd)}" if cwd else "")
    new += f" {shlex.quote(command)}" if command else ""
    tags = "".join(f" && tmux set-option -t {_opt(name)} {opt} {shlex.quote(val)}"
                   for opt, val in (("@hpchub_label", label), ("@hpchub_color", color)) if val)
    return f"tmux has-session -t {_t(name)} 2>/dev/null || {{ {new}{tags}; }}"


def open_line(name: str, command: str, label: str = "", color: str = "", cwd: str = "", node: str = "") -> str:
    """Create (if needed) and attach, on node if given. Without tmux, just run the command."""
    fallback = f"exec {command}" if command else "exec bash -l"
    line = (f"if command -v tmux >/dev/null 2>&1; then {create(name, command, label, color, cwd)} && "
            f"exec tmux attach-session -t {_t(name)}; else {fallback}; fi")
    return f"exec {on(node, line, tty=True)}" if node else line


def attach(s: Session) -> str:
    if s.kind == "screen":
        return f"exec screen -x {shlex.quote(s.name)}"
    line = f"exec tmux attach-session -t {_t(s.name)}"
    return f"exec {on(s.node, line, tty=True)}" if s.node else line


def set_label(s: Session, label: str) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X sessionname {shlex.quote(re.sub(r'[^\w.-]+', '-', label))}"
    return on(s.node, f"tmux set-option -t {_opt(s.name)} @hpchub_label {shlex.quote(label)}")


def set_color(s: Session, color: str) -> str:
    return on(s.node, f"tmux set-option -t {_opt(s.name)} @hpchub_color {shlex.quote(color)}")


def kill(s: Session) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X quit"
    return on(s.node, f"tmux kill-session -t {_t(s.name)}")


# Claude turned on by its remoteControlAtStartup setting prints no link: it is in the chat's transcript
# (a bridge_status entry). The chat is found from the claude process in the pane, else from the session name.
# Only this run of Claude counts, and only while connected: "disconnected ... run /remote-control" is off, any
# other disconnect may come back by itself. Prints the link while on, "on" if on without a link yet, else "".
CLAUDE_LINK = r"""import calendar, glob, json, os, subprocess, sys, time
name, tag = sys.argv[1], sys.argv[2]
out = lambda *a: subprocess.run(a, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, universal_newlines=True).stdout
pane = out("tmux", "display-message", "-p", "-t", "=" + name + ":", "#{pane_pid}").strip()
sid, since, todo = "", 0, [pane]
rows = [r.split(None, 2) for r in out("ps", "-e", "-o", "pid=,ppid=,comm=").splitlines()]
while todo and not sid:
    parent = todo.pop()
    for r in rows:
        if len(r) == 3 and (r[1] == parent or r[0] == pane == parent):
            if r[0] != parent:
                todo.append(r[0])
            if r[2].strip() == "claude":
                try:
                    info = json.load(open(os.path.expanduser("~/.claude/sessions/%s.json" % r[0])))
                    sid, since = info["sessionId"], info.get("startedAt", 0) / 1000.0
                except (OSError, ValueError, KeyError):
                    pass
sid = sid or tag
pattern = os.path.expanduser("~/.claude/projects/*/%s*.jsonl" % sid)
files = sorted(glob.glob(pattern), key=os.path.getmtime) if sid else []
on, url = False, ""
for line in open(files[-1], errors="replace") if files else []:
    marks = ('"bridge_status"', "Remote Control disconnected", "/remote-control</command-name>")
    if not any(m in line for m in marks):
        continue
    try:
        d = json.loads(line)
    except ValueError:
        continue
    try:
        when = calendar.timegm(time.strptime(d.get("timestamp", "")[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        when = 0
    if d.get("type") != "system" or (since and when < int(since)):
        continue
    text = str(d.get("content", ""))
    if d.get("subtype") == "bridge_status":
        on, url = True, d.get("url") or url
    elif "/remote-control</command-name>" in text:
        on = True
    elif "Remote Control disconnected" in text:  # "disconnected." you turned it off; "disconnected — why" it dropped
        why = text.split("Remote Control disconnected", 1)[1]
        on = why.lstrip().startswith("—") and not ("run /remote-control to retry" in why or "disabled after" in why)
print((url or "on") if on else "")
"""


def _chat_tag(name: str) -> str:
    """The chat id start in hpchub-claude-<job>-<tag> when a chat was resumed (8 hex), else ""."""
    tag = name.rsplit("-", 1)[-1]
    return tag if len(tag) == 8 and all(c in "0123456789abcdef" for c in tag) else ""


def capture_command(sessions: list[Session]) -> str:
    def one(t: Session) -> str:
        if t.agent == "claude":
            line = f"python3 -c {shlex.quote(CLAUDE_LINK)} {shlex.quote(t.name)} {shlex.quote(_chat_tag(t.name))}"
        else:
            line = f"tmux capture-pane -p -J -t {_opt(t.name)} -S -3000 2>/dev/null"
        return f"echo {shlex.quote(MARK + t.name)}; " + on(t.node, line)
    return "; ".join(one(t) for t in sessions)


def parse_remotes(text: str) -> dict[str, str]:
    """Newest remote link (or pairing code) per captured session. Claude sessions say "on" when connected
    without a link yet."""
    out, name, chunk = {}, "", []

    def flush():
        found = [x for x in links.find_links("\n".join(chunk)) if x.kind in (links.REMOTE, links.PAIR)]
        if name and [c.strip() for c in chunk if c.strip()] == ["on"]:
            out[name] = "on"
        elif name and found:
            last = found[-1]
            out[name] = last.url if last.kind == links.REMOTE else f"code:{last.code}"
    for line in text.splitlines():
        if line.startswith(MARK):
            flush()
            name, chunk = line[len(MARK):], []
        else:
            chunk.append(line)
    flush()
    return out


def disconnect_keys(screen: str) -> list[str]:
    """Keys that pick "Disconnect" in Claude's Remote Control panel: arrows from the ❯ line, then Enter."""
    lines = screen.splitlines()
    cursor = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].lstrip().startswith("❯ ")
                   and "/remote-control" not in lines[i]), None)
    target = next((i for i in range(len(lines) - 1, -1, -1) if "Disconnect" in lines[i]), None)
    if cursor is None or target is None or abs(cursor - target) > 6:
        return []
    return ["Up" if target < cursor else "Down"] * abs(cursor - target) + ["Enter"]


def set_remote_control(ssh: SshMaster, t: Session, want: bool) -> None:
    """Turn Remote Control on or off in the Claude running in t: types /remote-control, and to turn it off,
    picks Disconnect in the panel that opens. Blocking."""
    target = _opt(t.name)
    what = ssh.run(on(t.node, f"tmux display-message -p -t {target} '#{{pane_current_command}}'"), timeout=30)
    if what.returncode != 0:
        raise RuntimeError(what.stderr.strip() or "session not found")
    if what.stdout.strip() not in ("claude", "node", "srun"):
        raise RuntimeError(f"Claude is not running in this session ({what.stdout.strip() or 'nothing'})")
    run(ssh, on(t.node, f"tmux send-keys -t {target} -l /remote-control && tmux send-keys -t {target} Enter"))
    if want:
        return
    for _ in range(8):  # the status panel takes a moment
        time.sleep(0.5)
        screen = ssh.run(on(t.node, f"tmux capture-pane -p -t {target}"), timeout=30).stdout
        keys = disconnect_keys(screen)
        if keys:
            run(ssh, on(t.node, f"tmux send-keys -t {target} {' '.join(keys)}"))
            return
    raise RuntimeError("Could not find Disconnect in Claude's panel; pick it in the tab")


def find_remotes(ssh: SshMaster, sessions: list[Session]) -> dict[str, str]:
    return parse_remotes(ssh.run(capture_command(sessions), timeout=30).stdout) if sessions else {}


def set_remote(t: Session, value: str) -> str:
    return on(t.node, f"tmux set-option -t {_opt(t.name)} @hpchub_remote {shlex.quote(value)}")


def save_buffer(node: str) -> str:
    return on(node, "tmux save-buffer - 2>/dev/null")


def list_sessions(ssh: SshMaster) -> Listing:
    return parse(ssh.run(LIST, timeout=30).stdout)


def run(ssh: SshMaster, line: str) -> None:
    res = ssh.run(line, timeout=30)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "tmux command failed")
