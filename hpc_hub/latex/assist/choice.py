"""Which agent answers, with which model and effort."""

from dataclasses import dataclass

from ...agents.catalog import AGENTS, BY_ID, CLAUDE, Agent


@dataclass(frozen=True)
class Choice:
    agent: str = "claude"
    model: str = ""
    effort: str = ""


def option(agent: Agent, key: str):
    return next((o for o in agent.options if o.key == key), None)


def _choices(agent: Agent, key: str) -> list[list[str]]:
    o = option(agent, key)
    return [[v, label] for v, label in o.choices] if o else []


def describe() -> list[dict]:
    """What each agent offers: {id, name, models: [[value, label]], efforts: [[value, label]]}."""
    return [{"id": a.id, "name": a.name, "models": _choices(a, "model"), "efforts": _choices(a, "effort")}
            for a in AGENTS]


def check(agent: str, model: str = "", effort: str = "") -> Choice:
    """A choice the agent understands; a model or effort it has no setting for is dropped."""
    a = BY_ID.get(agent)
    if not a:
        raise ValueError(f"No agent {agent}")
    out = {}
    for key, value in (("model", model or ""), ("effort", effort or "")):
        o = option(a, key)
        if not o:
            out[key] = ""
            continue
        if value not in {v for v, _ in o.choices}:
            raise ValueError(f"{a.name} has no {o.label.lower()} {value}")
        out[key] = value
    return Choice(a.id, out["model"], out["effort"])


DEFAULT = Choice("claude", "haiku", "low")


def switch(c: Choice, agent: str) -> Choice:
    """Another agent (picked in Settings): the model and effort carry over when it has them; Claude starts at Haiku,
    Low again, the others at their default model and Low effort where they have effort."""
    a = BY_ID.get(agent)
    if not a:
        raise ValueError(f"No agent {agent}")
    if a.id == c.agent:
        return c
    start = DEFAULT if a is CLAUDE else Choice(a.id, "", "low")
    out = {}
    for key in ("model", "effort"):
        o = option(a, key)
        have = {v for v, _ in o.choices} if o else set()
        now, first = getattr(c, key), getattr(start, key)
        out[key] = now if now and now in have else first if first in have else ""
    return Choice(a.id, out["model"], out["effort"])


def label(c: Choice) -> str:
    """'Claude Haiku, Low' / 'ChatGPT, Medium' / 'Cursor Auto'."""
    a = BY_ID[c.agent]
    name = dict(option(a, "model").choices).get(c.model, c.model) if c.model and option(a, "model") else ""
    effort = dict(option(a, "effort").choices).get(c.effort, c.effort) if c.effort and option(a, "effort") else ""
    return f"{a.name}{' ' + name if name else ''}{', ' + effort if effort else ''}"
