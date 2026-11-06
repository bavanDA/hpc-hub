"""tmux and screen sessions on a cluster. Agent sessions run tmux on the job's node, reached with ssh from
the login node, so they end with the job. Labels and colors live in the session (@hpchub_label,
@hpchub_color)."""

import base64
import re
import secrets
import shlex
from dataclasses import dataclass

from ..core.ssh import SshMaster

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
    text = text.replace("\\037", SEP)  # tmux 3.4 prints the separator as the text \037
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


GONE = "This terminal has ended: its compute node's time ran out, or it was closed. Start a new one in Terminals."


def attach(s: Session) -> str:
    if s.kind == "screen":
        return f"exec screen -x {shlex.quote(s.name)}"
    # without the check tmux only says "no sessions" and the tab closes
    line = (f"tmux has-session -t {_t(s.name)} 2>/dev/null || {{ echo {shlex.quote(GONE)}; exit 1; }}; "
            f"exec tmux attach-session -t {_t(s.name)}")
    return f"exec {on(s.node, line, tty=True)}" if s.node else line


def set_label(s: Session, label: str) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X sessionname {shlex.quote(re.sub(r'[^\w.-]+', '-', label))}"
    return on(s.node, f"tmux set-option -t {_opt(s.name)} @hpchub_label {shlex.quote(label)}")


def kill(s: Session) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X quit"
    return on(s.node, f"tmux kill-session -t {_t(s.name)}")


SEND_MAX = 200_000  # characters pasted into a session at once


def send_text(name: str, text: str, node: str = "", enter: bool = True) -> str:
    """Paste text into a session as one bracketed paste (several lines arrive as one message to an agent),
    then press Enter. Through a tmux buffer, so quoting and newlines survive."""
    if len(text) > SEND_MAX:
        raise ValueError("That's too much text to send at once")
    buf = "hpchub-send-" + secrets.token_hex(3)
    data = base64.b64encode(text.encode()).decode()
    line = (f"printf %s {data} | base64 -d | tmux load-buffer -b {buf} - && "
            f"tmux paste-buffer -p -d -b {buf} -t {_opt(name)}")
    if enter:
        line += f" && tmux send-keys -t {_opt(name)} Enter"
    return on(node, line)


def save_buffer(node: str) -> str:
    return on(node, "tmux save-buffer - 2>/dev/null")


def list_sessions(ssh: SshMaster) -> Listing:
    return parse(ssh.run(LIST, timeout=30).stdout)


def run(ssh: SshMaster, line: str) -> None:
    res = ssh.run(line, timeout=30)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "tmux command failed")
