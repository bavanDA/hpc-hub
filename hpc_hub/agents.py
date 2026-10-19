"""Coding agents you can run on a compute node: Claude, ChatGPT (Codex), Antigravity."""

import shlex
from dataclasses import dataclass

from .config import AgentSettings


@dataclass(frozen=True)
class Option:
    """One setting an agent understands. choices: (value, label); value "" adds no flag."""
    key: str  # AgentSettings field
    label: str
    flag: str
    choices: tuple[tuple[str, str], ...]
    prefix: str = ""  # e.g. codex -c model_reasoning_effort=<value>
    switch: bool = False  # flag alone, no value
    unless_skip: bool = False  # ignored when permission prompts are skipped

    def args(self, value: str, skipping: bool) -> list[str]:
        if not value or (self.unless_skip and skipping):
            return []
        return [self.flag] if self.switch else [self.flag, shlex.quote(self.prefix + value)]


DEFAULT = ("", "Default")
EFFORT = (DEFAULT, ("low", "Low"), ("medium", "Medium"), ("high", "High"), ("xhigh", "Extra high"), ("max", "Max"))


@dataclass(frozen=True)
class Agent:
    id: str  # also the config key and chat-list kind
    name: str
    icon: str
    skip_flag: str
    remote_label: str
    remote_hint: str
    options: tuple[Option, ...] = ()


CLAUDE = Agent("claude", "Claude", "hpc-claude", "--dangerously-skip-permissions",
               "Remote control", "Use this session from claude.ai/code or the Claude app", (
                   Option("model", "Model", "--model", (DEFAULT, ("opus", "Opus"), ("sonnet", "Sonnet"),
                                                         ("haiku", "Haiku"))),
                   Option("mode", "Permission mode", "--permission-mode",
                          (DEFAULT, ("acceptEdits", "Accept edits"), ("plan", "Plan only"), ("auto", "Auto"),
                           ("dontAsk", "Don't ask")), unless_skip=True),
                   Option("effort", "Effort", "--effort", EFFORT)))
CODEX = Agent("codex", "ChatGPT", "hpc-openai-symbolic", "--dangerously-bypass-approvals-and-sandbox",
              "ChatGPT remote", "Use it from the ChatGPT app. One at a time: this stops the previous one", (
                  Option("sandbox", "Sandbox", "-s", (DEFAULT, ("read-only", "Read only"),
                                                      ("workspace-write", "Write in the folder"),
                                                      ("danger-full-access", "Full access")), unless_skip=True),
                  Option("approval", "Ask before running commands", "-a",
                         (DEFAULT, ("on-request", "When it thinks it should"), ("never", "Never")),
                         unless_skip=True),
                  Option("effort", "Reasoning effort", "-c", EFFORT[:5], prefix="model_reasoning_effort=")))
AGY = Agent("agy", "Antigravity", "hpc-antigravity", "--dangerously-skip-permissions",
            "Remote control", "Use this session from Antigravity on another device", (
                Option("mode", "Mode", "--mode", (DEFAULT, ("accept-edits", "Accept edits"), ("auto", "Auto"),
                                                  ("plan", "Plan only")), unless_skip=True),
                Option("effort", "Effort", "--effort", EFFORT),
                Option("sandbox", "Sandbox the terminal", "--sandbox", (("", "Off"), ("on", "On")), switch=True)))
AGENTS = [CLAUDE, CODEX, AGY]
BY_ID = {a.id: a for a in AGENTS}

PAIR_NOTE = "Pairing code below. In the ChatGPT app open Codex, then connect a machine and enter it."


def command(agent: Agent, s: AgentSettings, chat_id: str = "") -> str:
    """Shell line that starts (or resumes) the agent."""
    base = s.command.strip() or agent.id
    skip = [agent.skip_flag] if s.skip_permissions else []
    skip += [a for o in agent.options for a in o.args(getattr(s, o.key), s.skip_permissions)]
    chat = shlex.quote(chat_id) if chat_id else ""
    if agent is CODEX:
        # --no-daemon: Codex's shared background server keeps its socket in the job's private /tmp,
        # so from any other job it is unreachable ("app server did not become ready").
        args = ["resume", "--no-daemon", chat, *skip] if chat else ["--no-daemon", *skip]
        line = " ".join([base, *args])
        if s.remote:
            # one remote server per account: stop the old one, start it in this job (tmux keeps it alive)
            line = (f"{base} remote-control stop >/dev/null 2>&1; "
                    f"{base} remote-control start >/dev/null && echo {shlex.quote(PAIR_NOTE)} && "
                    f"{base} remote-control pair --json; {line}")
        return line
    args = list(skip)
    if s.remote:
        args.append("--remote-control")
    if chat:
        args += ["--resume", chat] if agent is CLAUDE else ["--conversation", chat]
    return " ".join([base, *args])
