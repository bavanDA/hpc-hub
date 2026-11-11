"""The terminal rail: reading a tmux session's history and its marks. Reads run only when you look; no method here
changes the session itself."""

from ...terminals import history, marks
from ..hub import hub
from ..server import method


@method("terminals.history")
def read_history(cluster: str, session: str, node: str = "", start: int | None = None,
                 count: int = history.WINDOW) -> dict:
    """A window of the session's lines: {start, rows, total, history, limit, height, width, alternate, in_mode}, or
    {gone: true}. start counts from the top of the history; without it, the last count lines."""
    return history.window(hub().connected(cluster).ssh, session, node, start, count)


@method("terminals.outline")
def read_outline(cluster: str, session: str, node: str = "", buckets: int = history.BUCKETS) -> dict:
    """A small map of the whole history: {map: [[kind, longest line] per bucket], prompts: [line], ...}."""
    return history.outline(hub().connected(cluster).ssh, session, node, buckets)


@method("terminals.marks")
def list_marks(cluster: str, session: str, node: str = "") -> dict:
    """{marks: [{id, name, line, rows, text, created, live}], ended}: live false when only its saved text is left."""
    ssh = hub().connected(cluster).ssh
    return marks.resolve(ssh, session, node, marks.load(ssh, session))


@method("terminals.mark_add")
def mark_add(cluster: str, session: str, name: str, line: int, rows: int, text: str) -> dict:
    return marks.add(hub().connected(cluster).ssh, session, name, line, rows, text)


@method("terminals.mark_rename")
def mark_rename(cluster: str, session: str, id: str, name: str) -> None:
    marks.rename(hub().connected(cluster).ssh, session, id, name)


@method("terminals.mark_remove")
def mark_remove(cluster: str, session: str, id: str) -> None:
    marks.remove(hub().connected(cluster).ssh, session, id)
