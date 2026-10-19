"""Coding agents you can run on a compute node: Claude, ChatGPT (Codex), Antigravity."""

import shlex
from dataclasses import dataclass

from .config import AgentSettings


@dataclass(frozen=True)
class Agent:
    id: str  # also the config key and chat-list kind
    name: str
    icon: str
    skip_flag: str
    remote_label: str
    remote_hint: str


CLAUDE = Agent("claude", "Claude", "hpc-claude", "--dangerously-skip-permissions",
               "Remote control", "Use this session from claude.ai/code or the Claude app")
CODEX = Agent("codex", "ChatGPT", "hpc-openai-symbolic", "--dangerously-bypass-approvals-and-sandbox",
              "ChatGPT remote", "Pair this node with the ChatGPT app (Codex), it keeps running in the job")
AGY = Agent("agy", "Antigravity", "hpc-antigravity", "--dangerously-skip-permissions",
            "Remote control", "Use this session from Antigravity on another device")
AGENTS = [CLAUDE, CODEX, AGY]
BY_ID = {a.id: a for a in AGENTS}

PAIR_NOTE = "Pairing code below. In the ChatGPT app open Codex, then connect a machine and enter it."


def command(agent: Agent, s: AgentSettings, chat_id: str = "") -> str:
    """Shell line that starts (or resumes) the agent."""
    base = s.command.strip() or agent.id
    skip = [agent.skip_flag] if s.skip_permissions else []
    chat = shlex.quote(chat_id) if chat_id else ""
    if agent is CODEX:
        args = ["resume", chat, *skip] if chat else skip
        line = " ".join([base, *args])
        if s.remote:
            # the remote-control daemon lives as long as this job step (tmux keeps the step alive)
            line = (f"{base} remote-control start >/dev/null && echo {shlex.quote(PAIR_NOTE)} && "
                    f"{base} remote-control pair --json; {line}")
        return line
    args = list(skip)
    if s.remote:
        args.append("--remote-control")
    if chat:
        args += ["--resume", chat] if agent is CLAUDE else ["--conversation", chat]
    return " ".join([base, *args])
