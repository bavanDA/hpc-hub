"""Write message: the prompt for a commit message and the message read from the answer."""

import re

from .reply import json_object

SUBJECTS = 12  # recent commit subjects, for the style


def message_prompt(diff: str, files: list[dict], subjects: list[str], split: bool) -> str:
    """files: [{path, added, removed, new}] (git_state's changes)."""
    listed = "\n".join(f"- {f['path']} +{f.get('added', 0)} -{f.get('removed', 0)}{' (new)' if f.get('new') else ''}"
                       for f in files)
    style = "\n".join(f"- {s}" for s in subjects[:SUBJECTS]) or "- (none yet)"
    shape = '{"subject": "...", "body": "..."}'
    rules = [
        "Subject: one line, at most 72 characters, plain words that say what changed in the paper, like "
        "\"Fix the constant in Lemma 2\". No period at the end.",
        "Body: one to three short sentences on why, only when the change shows a reason. Otherwise an empty string.",
        "Match the style of the recent subjects.",
    ]
    if split and len(files) > 1:
        rules.append("If the change holds clearly separate changes in different files, you may split it into 2 to 4 "
                     "commits. Every file goes in exactly one commit. Do not split one change that belongs together.")
        shape = ('{"subject": "...", "body": "...", "commits": [{"files": ["path", "..."], "subject": "...", '
                 '"body": "..."}]}\n("commits" only when you split; subject and body then describe it all as one '
                 "commit.)")
    return ("Write a git commit message for this change to a LaTeX paper.\n\n"
            + "\n".join(f"- {r}" for r in rules)
            + f"\n- Answer with JSON only, no other text:\n{shape}\n\n"
            f"Recent subjects:\n{style}\n\nFiles:\n{listed}\n\nDiff:\n{diff}\n")


def _subject(s: str) -> str:
    s = " ".join(str(s).strip().split("\n")[0].split())
    s = s.strip("`\"' ")
    s = re.sub(r"^(subject|summary|title)\s*:\s*", "", s, flags=re.I)
    return s.rstrip(".").strip()


def _body(s: object) -> str:
    if not isinstance(s, str):
        return ""
    return "\n".join(line.rstrip() for line in s.strip().split("\n")).strip()


def _split(raw: object, paths: list[str]) -> list[dict]:
    """The suggested commits, cleaned: known files only, each once, the ones it forgot go to the last commit.
    [] unless at least two commits are left."""
    if not isinstance(raw, list) or len(raw) < 2:
        return []
    by_name: dict[str, str] = {}
    for p in paths:
        by_name.setdefault(p.rsplit("/", 1)[-1], p)
    seen: set[str] = set()
    out = []
    for c in raw:
        if not isinstance(c, dict) or not _subject(c.get("subject", "")):
            continue
        files = []
        for f in c.get("files") or []:
            p = f if f in paths else by_name.get(str(f).rsplit("/", 1)[-1], "") if isinstance(f, str) else ""
            if p and p not in seen:
                seen.add(p)
                files.append(p)
        if files:
            out.append({"subject": _subject(c["subject"]), "body": _body(c.get("body")), "files": files})
    if len(out) < 2:
        return []
    out[-1]["files"] += [p for p in paths if p not in seen]
    return out


def parse_message(text: str, paths: list[str]) -> dict:
    """{subject, body, commits: [{subject, body, files}]} from the agent's answer (JSON, or plain text: the first
    line is the subject)."""
    d = json_object(text)
    if d and isinstance(d.get("subject"), str) and _subject(d["subject"]):
        return {"subject": _subject(d["subject"]), "body": _body(d.get("body")),
                "commits": _split(d.get("commits"), paths)}
    rows = [r for r in text.strip().split("\n") if not r.strip().startswith("```")]
    while rows and not _subject(rows[0]):
        rows.pop(0)
    if not rows:
        raise ValueError("The agent answered without a message")
    body = "\n".join(rows[1:])
    return {"subject": _subject(rows[0]), "body": _body(re.sub(r"^\s*body\s*:\s*", "", body, flags=re.I)),
            "commits": []}
