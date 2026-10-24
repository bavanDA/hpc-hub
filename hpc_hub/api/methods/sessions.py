"""Live connection state, and answers to questions a login asked (password, code, where to sign in)."""

from ..hub import hub, session_json
from ..server import method


@method("sessions.list")
def sessions() -> list[dict]:
    return [session_json(s) for s in hub().sessions.values()]


@method("question.answer")
def answer(id: str, answer: str | None = None) -> None:
    hub().answer(id, answer)
