"""Live connection state, and answers to questions a login asked (password, code, where to sign in)."""

from ...core import single
from ..hub import hub, session_json
from ..server import method


@method("sessions.list")
def sessions() -> list[dict]:
    if hub().blocked:
        raise RuntimeError(single.MESSAGE)
    return [session_json(s) for s in hub().sessions.values()]


@method("question.answer")
def answer(id: str, answer: str | None = None) -> None:
    hub().answer(id, answer)
