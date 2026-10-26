"""Coding agents you can run on a compute node: Claude, ChatGPT (Codex), Antigravity, Cursor."""

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

    def args(self, value: str) -> list[str]:
        if not value:
            return []
        return [self.flag] if self.switch else [self.flag, shlex.quote(self.prefix + value)]


DEFAULT = ("", "Default")
EFFORT = (DEFAULT, ("low", "Low"), ("medium", "Medium"), ("high", "High"), ("xhigh", "Extra high"), ("max", "Max"))


@dataclass(frozen=True)
class Agent:
    id: str  # also the config key and chat-list kind
    name: str
    icon: str
    remote_label: str
    remote_hint: str
    options: tuple[Option, ...] = ()
    task_flag: str = ""  # how to give a first prompt in interactive mode ("" = as the last argument)
    remote_setting: str = ""  # settings.json key that turns remote control on, used instead of --remote-control


CLAUDE = Agent("claude", "Claude", "hpc-claude",
               "Remote control", "Use this session from claude.ai/code or the Claude app", (
                   Option("model", "Model", "--model", (DEFAULT, ("opus", "Opus"), ("sonnet", "Sonnet"),
                                                         ("haiku", "Haiku"))),
                   Option("mode", "Permission mode", "--permission-mode",
                          (DEFAULT, ("acceptEdits", "Accept edits"), ("plan", "Plan only"), ("auto", "Auto"),
                           ("dontAsk", "Don't ask"))),
                   Option("effort", "Effort", "--effort", EFFORT)), remote_setting="remoteControlAtStartup")
CODEX = Agent("codex", "ChatGPT", "hpc-openai-symbolic",
              "ChatGPT remote", "Use it from the ChatGPT app. One at a time: this stops the previous one", (
                  Option("sandbox", "Sandbox", "-s", (DEFAULT, ("read-only", "Read only"),
                                                      ("workspace-write", "Write in the folder"))),
                  Option("approval", "Ask before running commands", "-a",
                         (DEFAULT, ("on-request", "When it thinks it should"), ("never", "Never"))),
                  Option("effort", "Reasoning effort", "-c", EFFORT[:5], prefix="model_reasoning_effort=")))
AGY = Agent("agy", "Antigravity", "hpc-antigravity",
            "Remote control", "Use this session from Antigravity on another device", (
                Option("mode", "Mode", "--mode", (DEFAULT, ("accept-edits", "Accept edits"), ("auto", "Auto"),
                                                  ("plan", "Plan only"))),
                Option("effort", "Effort", "--effort", EFFORT),
                Option("sandbox", "Sandbox the terminal", "--sandbox", (("", "Off"), ("on", "On")), switch=True)),
            task_flag="-i")
CURSOR = Agent("cursor", "Cursor", "hpc-cursor-symbolic", "", "", (
    Option("model", "Model", "--model", (DEFAULT, ("auto", "Auto"), ("composer-2.5", "Composer 2.5"),
                                         ("claude-opus-5-thinking-high", "Claude Opus 5"),
                                         ("claude-sonnet-5-thinking-high", "Claude Sonnet 5"),
                                         ("gpt-5.6-sol-high", "GPT-5.6 Sol"),
                                         ("gemini-3.7-flash-high", "Gemini 3.7 Flash"))),
    Option("mode", "Mode", "--mode", (DEFAULT, ("plan", "Plan only"), ("ask", "Ask (read only)"))),
    Option("sandbox", "Sandbox", "--sandbox", (DEFAULT, ("enabled", "On"), ("disabled", "Off")))))
AGENTS = [CLAUDE, CODEX, AGY, CURSOR]
BY_ID = {a.id: a for a in AGENTS}

PAIR_NOTE = "Pairing code below. In the ChatGPT app open Codex, then connect a machine and enter it."


CLAUDE_CLASSIC = "export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && "  # see command()


def claude_start(base: str) -> str:
    """What runs before Claude. Its program is ~300 MB on the cluster's shared file system: started cold it
    reads itself in small pieces and took over 2 minutes on Wulver (blank tab); read in one go it takes
    seconds. A custom command or an alias that isn't on PATH is just started."""
    exe = shlex.quote(shlex.split(base)[0]) if base.strip() else "claude"
    return (CLAUDE_CLASSIC + "echo 'Starting Claude...' && "
            f"{{ cat \"$(readlink -f \"$(type -P {exe})\")\" >/dev/null 2>&1 || true; }} && ")


def command(agent: Agent, s: AgentSettings, chat_id: str = "", task: str = "") -> str:
    """Shell line that starts (or resumes) the agent; task is a first prompt it starts working on.
    Claude runs with its classic screen: what it prints lands in the terminal's scrollback, and the mouse
    stays with the terminal (select, scroll, links), instead of its full-screen view."""
    base = s.command.strip() or agent.id
    opts = [a for o in agent.options for a in o.args(getattr(s, o.key))]
    chat = shlex.quote(chat_id) if chat_id else ""
    if agent is CODEX:
        # --no-daemon: Codex's shared background server keeps its socket in the job's private /tmp,
        # so from any other job it is unreachable ("app server did not become ready").
        args = ["resume", "--no-daemon", chat, *opts] if chat else ["--no-daemon", *opts]
        line = " ".join([base, *args, *_task(agent, task)])
        if s.remote:
            # one remote server per account: stop the old one, start it in this job (tmux keeps it alive)
            line = (f"{base} remote-control stop >/dev/null 2>&1; "
                    f"{base} remote-control start >/dev/null && echo {shlex.quote(PAIR_NOTE)} && "
                    f"{base} remote-control pair --json; {line}")
        return line
    args = list(opts)
    if s.remote and agent.remote_label and not agent.remote_setting:
        args.append("--remote-control")
    if chat:
        args += ["--conversation", chat] if agent is AGY else ["--resume", chat]
    line = " ".join([base, *args, *_task(agent, task)])
    return claude_start(base) + line if agent is CLAUDE else line


def _task(agent: Agent, task: str) -> list[str]:
    task = task.strip()
    if not task:
        return []
    return [agent.task_flag, shlex.quote(task)] if agent.task_flag else [shlex.quote(task)]
