"""Coding agents that run on a compute node, and the command lines that start them."""

import shlex
from dataclasses import dataclass

from ..core.config import AgentSettings


@dataclass(frozen=True)
class Option:
    """One setting an agent understands. choices: (value, label); value "" adds no flag."""
    key: str  # AgentSettings field
    label: str
    flag: str
    choices: tuple[tuple[str, str], ...]
    prefix: str = ""  # e.g. codex -c model_reasoning_effort=<value>
    switch: bool = False  # flag alone, no value
    blank: str = ""  # what nothing chosen means: the first choice, given to the agent ("" = no flag)

    def args(self, value: str) -> list[str]:
        value = value or self.blank
        if not value:
            return []
        return [self.flag] if self.switch else [self.flag, shlex.quote(self.prefix + value)]


DEFAULT = ("", "Default")
EFFORT = (DEFAULT, ("low", "Low"), ("medium", "Medium"), ("high", "High"), ("xhigh", "Extra high"), ("max", "Max"))


@dataclass(frozen=True)
class Agent:
    id: str  # also the config key and chat-list kind
    name: str
    remote_label: str
    remote_hint: str
    options: tuple[Option, ...] = ()
    task_flag: str = ""  # how to give a first prompt in interactive mode ("" = as the last argument)
    remote_setting: str = ""  # settings.json key kept in step with remote control (also given --remote-control)


CLAUDE = Agent("claude", "Claude", "Remote control", "Use this session from claude.ai/code or the Claude app", (
    Option("model", "Model", "--model", (DEFAULT, ("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"))),
    # auto unless you pick another: Claude checks each step itself and asks only when one looks risky
    Option("mode", "Permission mode", "--permission-mode",
           (("", "Auto"), ("manual", "Ask before changes"), ("acceptEdits", "Accept edits"), ("plan", "Plan only"),
            ("dontAsk", "Don't ask")), blank="auto"),
    Option("effort", "Effort", "--effort", EFFORT)), remote_setting="remoteControlAtStartup")
CODEX = Agent("codex", "ChatGPT", "ChatGPT remote", "Use this session from the ChatGPT app, one session at a time", (
    Option("sandbox", "Sandbox", "-s",
           (DEFAULT, ("read-only", "Read only"), ("workspace-write", "Write in the folder"))),
    Option("approval", "Ask before running commands", "-a",
           (DEFAULT, ("on-request", "When it thinks it should"), ("never", "Never"))),
    Option("effort", "Reasoning effort", "-c", EFFORT[:5], prefix="model_reasoning_effort=")))
AGY = Agent("agy", "Antigravity", "Remote control", "Use this session from Antigravity on another device", (
    Option("mode", "Mode", "--mode",
           (DEFAULT, ("accept-edits", "Accept edits"), ("auto", "Auto"), ("plan", "Plan only"))),
    Option("effort", "Effort", "--effort", EFFORT),
    Option("sandbox", "Sandbox the terminal", "--sandbox", (("", "Off"), ("on", "On")), switch=True)), task_flag="-i")
CURSOR = Agent("cursor", "Cursor", "", "", (
    Option("model", "Model", "--model", (DEFAULT, ("auto", "Auto"), ("composer-2.5", "Composer 2.5"),
                                         ("claude-opus-5-thinking-high", "Claude Opus 5"),
                                         ("claude-sonnet-5-thinking-high", "Claude Sonnet 5"),
                                         ("gpt-5.6-sol-high", "GPT-5.6 Sol"),
                                         ("gemini-3.7-flash-high", "Gemini 3.7 Flash"))),
    Option("mode", "Mode", "--mode", (DEFAULT, ("plan", "Plan only"), ("ask", "Ask (read only)"))),
    Option("sandbox", "Sandbox", "--sandbox", (DEFAULT, ("enabled", "On"), ("disabled", "Off")))))
AGENTS = [CLAUDE, CODEX, AGY, CURSOR]
BY_ID = {a.id: a for a in AGENTS}

# Each agent's own installer, as its maker documents it: one user, no root, no Node.js, into ~/.local/bin
INSTALL = {
    "claude": "curl -fsSL https://claude.ai/install.sh | bash",  # code.claude.com/docs/en/setup
    "codex": "curl -fsSL https://chatgpt.com/codex/install.sh | sh",  # learn.chatgpt.com/docs/codex/cli
    "agy": "curl -fsSL https://antigravity.google/cli/install.sh | bash",  # antigravity.google/docs/install
    "cursor": "curl -fsS https://cursor.com/install | bash",  # cursor.com/docs/cli/installation
}


class NotInstalled(RuntimeError):
    """The agent's command isn't on the cluster; the app offers to install it (kind goes to the UI)."""
    kind = "not-installed"


PAIR_NOTE = "Pairing code below. In the ChatGPT app open Codex, then connect a machine and enter it."


CLAUDE_CLASSIC = "export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && "  # see command()


def _exe(base: str, default: str) -> str:
    return shlex.quote(shlex.split(base)[0]) if base.strip() else default


def _where(exe: str) -> str:
    """The program's real file (an update points the link in ~/.local/bin at a new one); "" when not on PATH."""
    return f"\"$(readlink -f \"$(type -P {exe})\")\""


def _warm(exe: str) -> str:
    return f"{{ cat {_where(exe)} >/dev/null 2>&1 || true; }} && "


def claude_start(base: str) -> str:
    """What runs before Claude. Its program is ~300 MB on the cluster's shared file system: started cold it
    reads itself in small pieces and took over 2 minutes on Wulver (blank tab); read in one go it takes
    seconds. A custom command or an alias that isn't on PATH is just started."""
    return CLAUDE_CLASSIC + "echo 'Starting Claude...' && " + _warm(_exe(base, "claude"))


CODEX_UPDATED = "Codex updated itself: starting it again..."


def codex_start(base: str, line: str) -> str:
    """Codex, read in one go first as Claude is (its program is ~320 MB too: 11 s cold on Wulver just to print its
    version). And when it updates itself on start it says "Please restart Codex" and quits: the tab was left at a
    shell, and plain `codex` typed there waits on Codex's shared background server, which on a cluster never
    answers (2026-11-24: "codex starting is very slow"). So a Codex whose program changed while it ran is
    started again, the same way (--no-daemon)."""
    exe = _exe(base, "codex")
    # in braces: one command, so `cd folder && ...` before it still holds it back
    return (f"{{ echo 'Starting Codex...' && {_warm(exe)}was={_where(exe)}; {line}; "
            f"if [ -n \"$was\" ] && [ {_where(exe)} != \"$was\" ]; then "
            f"echo {shlex.quote(CODEX_UPDATED)}; {line}; fi; }}")


def command(agent: Agent, s: AgentSettings, chat_id: str = "", task: str = "", session_id: str = "") -> str:
    """Shell line that starts (or resumes) the agent; task is a first prompt it starts working on. session_id: a
    new Claude chat's id, chosen here so the Chat view finds its file (agents/chat_view.py).
    Claude runs with its classic screen: what it prints lands in the terminal's scrollback, and the mouse
    stays with the terminal (select, scroll, links), instead of its full-screen view."""
    base = s.command.strip() or agent.id
    opts = [a for o in agent.options for a in o.args(getattr(s, o.key))]
    chat = shlex.quote(chat_id) if chat_id else ""
    if agent is CODEX:
        # --no-daemon: Codex's shared background server keeps its socket in the job's private /tmp,
        # so from any other job it is unreachable ("app server did not become ready").
        args = ["resume", "--no-daemon", chat, *opts] if chat else ["--no-daemon", *opts]
        line = codex_start(base, " ".join([base, *args, *_task(agent, task)]))
        if s.remote:
            # one remote server per account: stop the old one, start it in this job (tmux keeps it alive)
            line = (f"{base} remote-control stop >/dev/null 2>&1; "
                    f"{base} remote-control start >/dev/null && echo {shlex.quote(PAIR_NOTE)} && "
                    f"{base} remote-control pair --json; {line}")
        return line
    args = list(opts)
    if s.remote and agent.remote_label:
        args.append("--remote-control")  # Claude prints its link only when started with it, not by its setting
    if chat:
        args += ["--conversation", chat] if agent is AGY else ["--resume", chat]
    elif session_id and agent is CLAUDE:
        args += ["--session-id", shlex.quote(session_id)]
    line = " ".join([base, *args, *_task(agent, task)])
    return claude_start(base) + line if agent is CLAUDE else line


def _task(agent: Agent, task: str) -> list[str]:
    task = task.strip()
    if not task:
        return []
    return [agent.task_flag, shlex.quote(task)] if agent.task_flag else [shlex.quote(task)]
