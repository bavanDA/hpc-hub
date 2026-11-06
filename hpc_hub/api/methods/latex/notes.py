from ....latex import assist, notes
from ...hub import hub
from ...server import method
from .agent import start, uncommitted


@method("latex.notes")
def notes_list(cluster: str, folder: str) -> dict:
    return notes.load(hub().connected(cluster).ssh, folder)


@method("latex.note_add")
def note_add(cluster: str, folder: str, text: str, place: dict | None = None) -> dict:
    return notes.add(hub().connected(cluster).ssh, folder, text, place)


@method("latex.note_set")
def note_set(cluster: str, folder: str, id: str, text: str | None = None,  # noqa: A002
             done: bool | None = None) -> dict:
    return notes.update(hub().connected(cluster).ssh, folder, id, text, done)


@method("latex.note_delete")
def note_delete(cluster: str, folder: str, id: str) -> None:  # noqa: A002
    notes.remove(hub().connected(cluster).ssh, folder, id)


@method("latex.agent_check")
def agent_check(cluster: str, folder: str, choice: dict | None = None) -> dict:
    """Check my list: the open notes against the changes not committed yet. Nothing is checked off."""
    def build(ssh):
        open_ = [n for n in notes.load(ssh, folder)["notes"] if not n.get("done")]
        if not open_:
            raise RuntimeError("No open notes to check")
        _, ch = uncommitted(ssh, folder)
        prompt = assist.check_prompt(open_, assist.diff_text(ch))
        return prompt, lambda text: {"checked": len(open_), "results": assist.parse_check(text, open_)}, \
            {"notes": len(open_)}
    return start("check", cluster, folder, choice, build)
