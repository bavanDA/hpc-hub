"""Check my list: whether the changes do what each open note asks."""

import json

from .reply import json_object

VERDICTS = ("done", "not_yet", "unsure")


def _place(p: dict | None) -> str:
    if not p:
        return ""
    if p.get("path"):
        return f" (about {p['path']} line {p.get('line', 0)})"
    if p.get("page"):
        return f" (about page {p['page']} of the PDF)"
    if p.get("hash"):
        return f" (about commit {str(p['hash'])[:7]})"
    return ""


def check_prompt(notes: list[dict], diff: str) -> str:
    listed = "\n".join(f"- id {n['id']}: {json.dumps(n['text'])}{_place(n.get('place'))}" for n in notes)
    return ("Below are open notes (comments and to-dos) on a LaTeX paper, and the author's changes not committed "
            "yet. For each note, say whether the changes do what it asks.\n\n"
            "- verdict \"done\": the changes clearly do it. \"not_yet\": they do not, or only in part. \"unsure\": "
            "the changes do not show it either way.\n"
            "- reason: one short sentence. Point at the evidence as [[path:line]] (new line numbers) when there is "
            "some, and give that path and line.\n"
            "- Never say done without evidence in the changes.\n"
            "- Answer with JSON only, no other text:\n"
            '{"notes": [{"id": "...", "verdict": "done", "reason": "...", "path": "", "line": 0}]}\n\n'
            f"Notes:\n{listed}\n\nChanges:\n{diff}\n")


def parse_check(text: str, notes: list[dict]) -> list[dict]:
    """One result per note, in the notes' order: {id, verdict, reason, path, line}. A note the agent skipped, or
    an answer that is not JSON, is unsure."""
    d = json_object(text) or {}
    got = {}
    for r in d.get("notes") or []:
        if isinstance(r, dict) and str(r.get("id", "")) and str(r.get("id")) not in got:
            got[str(r["id"])] = r
    out = []
    for n in notes:
        r = got.get(n["id"], {})
        verdict = str(r.get("verdict", "")).lower().replace(" ", "_").replace("-", "_")
        line = r.get("line")
        out.append({"id": n["id"], "verdict": verdict if verdict in VERDICTS else "unsure",
                    "reason": " ".join(str(r.get("reason") or "").split()) or "The agent did not say.",
                    "path": str(r.get("path") or "").strip(),
                    "line": line if isinstance(line, int) and line > 0 else 0})
    return out
