"""An ask's answer and the files it proposes, fetched back as one tar."""

import base64
import hashlib
import io
import json
import posixpath
import re
import tarfile
from dataclasses import dataclass

from .model import ROOT, check_id

MAX_RESULT = 20 * 1024 * 1024  # bytes of results fetched back


def fetch_command(ask_id: str) -> str:
    """Everything an answer needs, as a base64 tar of the ask's folder (no run.sh, no git lists)."""
    out = f'"$HOME"/{ROOT}/{check_id(ask_id)}'
    return (f"cd {out} && tar -cz --exclude=run.sh --exclude=.before --exclude=.after --exclude=.b "
            f"--exclude=state.tmp . 2>/dev/null | head -c {MAX_RESULT} | base64 | tr -d '\\n'")


@dataclass
class Proposed:
    path: str
    base_sha: str
    original: str
    proposed: str
    is_new: bool


@dataclass
class Result:
    id: str
    answer: str
    files: list[Proposed]
    chat_id: str
    put_back: list[str]  # files the agent changed in place, put back as they were (shown as proposals)
    state: str


def _text(data: bytes) -> str | None:
    try:
        return data.decode()
    except UnicodeDecodeError:
        return None


def chat_id_from_log(log: str) -> tuple[str, str]:
    """(session id, result text) from `claude -p --output-format json`'s output, else ('', '')."""
    for chunk in (log.strip(), log.strip().splitlines()[-1] if log.strip() else ""):
        try:
            data = json.loads(chunk)
        except ValueError:
            continue
        if isinstance(data, dict):
            sid = str(data.get("session_id", ""))
            return (sid if re.match(r"^[A-Za-z0-9_-]{1,80}$", sid) else ""), str(data.get("result", ""))
    return "", ""


def parse_result(ask_id: str, b64: str) -> Result:
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(b64 or "")), mode="r:gz") as tar:
        for m in tar.getmembers():
            if m.isfile():
                f = tar.extractfile(m)
                if f:
                    files[posixpath.normpath(m.name).lstrip("./")] = f.read()
    root = (_text(files.get("root", b"")) or "").strip()
    log = _text(files.get("log", b"")) or ""
    chat_id, result_text = chat_id_from_log(log)
    answer = (_text(files.get("answer.md", b"")) or "").strip()
    if result_text and (not answer or log.strip().endswith(answer)):
        answer = result_text.strip()  # Claude printed JSON and wrote no answer.md: its result is the answer
    proposed = []
    for name, data in sorted(files.items()):
        if not name.startswith("proposed/"):
            continue
        rel = name[len("proposed/"):]
        new_text = _text(data)
        if new_text is None or not rel or ".." in rel.split("/"):
            continue
        base = files.get("snapshot/" + rel)
        old = _text(base) if base is not None else ""
        if old is None or old == new_text:
            continue
        proposed.append(Proposed(posixpath.join(root, rel) if root else rel,
                                 hashlib.sha256(base).hexdigest() if base is not None else "",
                                 old, new_text, base is None))
    put_back = [x for x in (_text(files.get("put_back", b"")) or "").splitlines() if x]
    state = (_text(files.get("state", b"")) or "").strip()
    return Result(check_id(ask_id), answer, proposed, chat_id, put_back, state)
