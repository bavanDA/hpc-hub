"""Persistent terminals on a cluster: tmux (and screen) sessions you can leave and come back to.

Labels and colors live in the tmux session itself (@hpchub_label, @hpchub_color), so they
survive app restarts and show up from any laptop.
"""

import re
import shlex
from dataclasses import dataclass

from .ssh import SshMaster

SEP = "\x1f"
FIELDS = ["session_name", "session_created", "session_attached", "@hpchub_label", "@hpchub_color",
          "pane_current_command", "session_windows", "pane_current_path"]
LIST = ("hostname; command -v tmux >/dev/null && echo TMUX_OK; "
        f"tmux list-sessions -F {shlex.quote(SEP.join('#{' + f + '}' for f in FIELDS))} 2>/dev/null; "
        "echo SCREEN_LIST; screen -ls 2>/dev/null; "
        'echo JOB_LIST; squeue -h -u "$USER" -t RUNNING -o "%i %N" 2>/dev/null')
SCREEN_RE = re.compile(r"^\s+(\d+)\.(\S+)\s+\((?:\d.*?\)\s+\()?(Attached|Detached)\)", re.M)
COLORS = ["#3584e4", "#2ec27e", "#e5a50a", "#ff7800", "#e01b24", "#9141ac", "#986a44", "#77767b"]
AGENT_COLORS = {"claude": "#d97757", "codex": "#10a37f", "agy": "#4285f4", "vscode": "#3584e4"}
NAME_RE = re.compile(r"^[\w.-]+$")


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


def parse(text: str) -> Listing:
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
            p = (line.split(SEP) + [""] * len(FIELDS))[:len(FIELDS)]
            out.append(Session(p[0], "tmux", _int(p[1]), _int(p[2]), p[3], p[4], p[5], _int(p[6]) or 1, p[7]))
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


def create(name: str, command: str, label: str = "", color: str = "", cwd: str = "") -> str:
    """Start a detached session unless it exists, then tag it. Shell line."""
    q = shlex.quote(name)
    new = f"tmux new-session -d -s {q}" + (f" -c {shlex.quote(cwd)}" if cwd else "")
    new += f" {shlex.quote(command)}" if command else ""
    tags = "".join(f" && tmux set-option -t {_opt(name)} {opt} {shlex.quote(val)}"
                   for opt, val in (("@hpchub_label", label), ("@hpchub_color", color)) if val)
    return f"tmux has-session -t {_t(name)} 2>/dev/null || {{ {new}{tags}; }}"


def open_line(name: str, command: str, label: str = "", color: str = "", cwd: str = "") -> str:
    """Create (if needed) and attach. Without tmux, just run the command."""
    fallback = f"exec {command}" if command else "exec bash -l"
    return (f"if command -v tmux >/dev/null 2>&1; then {create(name, command, label, color, cwd)} && "
            f"exec tmux attach-session -t {_t(name)}; else {fallback}; fi")


def attach(s: Session) -> str:
    if s.kind == "screen":
        return f"exec screen -x {shlex.quote(s.name)}"
    return f"exec tmux attach-session -t {_t(s.name)}"


def set_label(s: Session, label: str) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X sessionname {shlex.quote(re.sub(r'[^\w.-]+', '-', label))}"
    return f"tmux set-option -t {_opt(s.name)} @hpchub_label {shlex.quote(label)}"


def set_color(s: Session, color: str) -> str:
    return f"tmux set-option -t {_opt(s.name)} @hpchub_color {shlex.quote(color)}"


def kill(s: Session) -> str:
    if s.kind == "screen":
        return f"screen -S {shlex.quote(s.name)} -X quit"
    return f"tmux kill-session -t {_t(s.name)}"


def list_sessions(ssh: SshMaster) -> Listing:
    return parse(ssh.run(LIST, timeout=30).stdout)


def run(ssh: SshMaster, line: str) -> None:
    res = ssh.run(line, timeout=30)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "tmux command failed")
