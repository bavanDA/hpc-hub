import posixpath

from ....files import remote_fs
from ....latex import assist, history
from ...server import method
from .agent import start, uncommitted

MAX_QUESTION = 2000
MAX_SNIPPET = 6000  # characters of a selection or a hunk the app sends along


def _clip(text: str, n: int = MAX_SNIPPET) -> str:
    text = str(text or "")
    return text if len(text) <= n else text[:n] + "\n[... the rest left out]"


def _commit(ssh, folder: str, about: dict) -> tuple[str, str]:
    c = history.commit(ssh, folder, str(about.get("hash", "")))
    diff = assist.diff_text(history.changes(ssh, folder, "", c["hash"], 3))
    return (f"commit {c['short']} \"{c['subject']}\"",
            f"Commit {c['short']} by {c['author']}: {c['subject']}\n{c['body']}\n\nIts diff:\n{diff}")


def _range(ssh, folder: str, about: dict) -> tuple[str, str]:
    frm, to = str(about.get("frm", "")), str(about.get("to", ""))
    diff = assist.diff_text(history.changes(ssh, folder, frm, to, 3))
    between = history.log(ssh, folder, to or "HEAD", 200, stats=False)
    if frm:
        between = between[:next((i for i, x in enumerate(between) if x["hash"].startswith(frm)), len(between))]
    subjects = "\n".join(f"- {x['short']} {x['author']}: {x['subject']}" for x in between[:40])
    title = f"what changed from {frm[:7] or 'the start'} to {to[:7] or 'the files now'}"
    return title, f"Commits in between:\n{subjects or '- (none)'}\n\nThe diff:\n{diff}"


def _lines(ssh, folder: str, about: dict) -> tuple[str, str]:
    path = str(about.get("path", "")).strip()
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Bad path")
    line = max(1, int(about.get("line") or 1))
    end = max(line, int(about.get("end") or line))
    at = str(about.get("at") or "")
    if at:
        text = history.file_at(ssh, folder, at, path)
    else:
        root = history.state(ssh, folder)["root"]
        text = remote_fs.read_bytes(ssh, posixpath.join(root, path)).decode("utf-8", "replace")
    where = f"{path}, line {line}" if end == line else f"{path}, lines {line} to {end}"
    when = f" as of commit {at[:7]}" if at else " as it is now"
    parts = [f"{where}{when}, with the lines around them:\n{assist.numbered(text, line, end)}"]
    if about.get("text"):
        parts.append(f"The selected text: {_clip(about['text'], 2000)!r}")
    if about.get("diff"):
        parts.append(f"The change there:\n{_clip(about['diff'])}")
    if about.get("page"):
        parts.append(f"It is on page {int(about['page'])} of the PDF.")
    title = ("the selected text in " if about.get("text") else "") + where
    return title, "\n\n".join(parts)


def _pdf_spot(about: dict) -> tuple[str, str]:
    page = int(about.get("page") or 1)
    return f"a spot on page {page} of the PDF", f"Text near that spot:\n{_clip(about.get('text', ''))}"


def _now(ssh, folder: str) -> tuple[str, str]:
    _, ch = uncommitted(ssh, folder)
    return "the changes not committed yet", f"The diff:\n{assist.diff_text(ch)}"


def material(ssh, folder: str, about: dict) -> tuple[str, str]:
    """(one line on what the question is about, what the agent gets to read)."""
    kind = about.get("kind")
    if kind == "commit":
        return _commit(ssh, folder, about)
    if kind == "range":
        return _range(ssh, folder, about)
    if kind == "pdf" and not about.get("path"):
        return _pdf_spot(about)
    if kind in ("lines", "pdf"):
        return _lines(ssh, folder, about)
    if kind == "now":
        return _now(ssh, folder)
    raise ValueError("Ask about a commit, a change, some lines or a spot in the PDF")


@method("latex.agent_ask")
def agent_ask(cluster: str, folder: str, question: str, about: dict, choice: dict | None = None) -> dict:
    """choice: {model, effort} of your agent for this question only."""
    q = (question or "").strip()[:MAX_QUESTION]
    if not q:
        raise ValueError("Write a question first")

    def build(ssh):
        title, text = material(ssh, folder, about or {})
        return (assist.ask_prompt(q, title, text), lambda answer: {**assist.parse_answer(answer), "question": q},
                {"title": title})
    return start("ask", cluster, folder, choice, build)
