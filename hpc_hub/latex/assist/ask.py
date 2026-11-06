"""Ask: a question about a change, and the answer with the lines and pages it points at."""

import re

CITE_RE = re.compile(r"\[\[\s*(?:(?:page|p\.)\s*(\d+)|([^\[\]\n:]+?):(\d+)(?:\s*[-–]\s*(\d+))?)\s*\]\]", re.I)
ASK_RULES = ("Answer in a few short sentences, plainly, for a researcher. When you point at a line, write it as "
             "[[path:line]] or [[path:first-last]], with the path exactly as given below; a page of the PDF as "
             "[[page N]]. Use no other kind of link. If the material below does not answer the question, say so.")


def ask_prompt(question: str, about: str, material: str) -> str:
    """about: one line on what is asked about; material: the diff, lines or commit it is about."""
    return (f"An author of a LaTeX paper asks about a change in its git history.\n\n{ASK_RULES}\n\n"
            f"The question is about: {about}\n\n{material.strip()}\n\nQuestion: {question.strip()}\n")


def parse_answer(text: str) -> dict:
    """{text, cites: [{ref, path, line, end, page}]}; ref is the [[...]] as it stands in text."""
    t = "\n".join(r for r in text.strip().split("\n") if not r.strip().startswith("```")).strip()
    if not t:
        raise ValueError("The agent answered nothing")
    cites = []
    for m in CITE_RE.finditer(t):
        page, path, line, end = m.group(1), m.group(2), m.group(3), m.group(4)
        cites.append({"ref": m.group(0), "path": (path or "").strip(), "line": int(line or 0),
                      "end": int(end or line or 0), "page": int(page or 0)})
    return {"text": t, "cites": cites}
