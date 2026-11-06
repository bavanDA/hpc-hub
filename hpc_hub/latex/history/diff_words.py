"""The changed words inside lines that changed."""

import difflib
import re

TOKEN_RE = re.compile(r"\\[A-Za-z@]+|[A-Za-z]+|[0-9]+|\s+|.", re.S)


def _spans(tokens: list[str], ranges: list[tuple[int, int]]) -> list[list[int]]:
    at, offs, full = 0, [0], "".join(tokens)
    for t in tokens:
        at += len(t)
        offs.append(at)
    out: list[list[int]] = []
    for i, j in ranges:
        a, b = offs[i], offs[j]
        text = "".join(tokens[i:j])
        a += len(text) - len(text.lstrip())
        b -= len(text) - len(text.rstrip())
        if b <= a:
            continue
        if out and not full[out[-1][1]:a].strip():
            out[-1][1] = b  # only spaces between two marks: one mark
        else:
            out.append([a, b])
    return out


def word_marks(a: str, b: str) -> tuple[list[list[int]], list[list[int]]]:
    """The changed words of two versions of a line, as [from, to) character ranges in each."""
    ta, tb = TOKEN_RE.findall(a), TOKEN_RE.findall(b)
    ra, rb = [], []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ta, tb, autojunk=False).get_opcodes():
        if op != "equal":
            if i2 > i1:
                ra.append((i1, i2))
            if j2 > j1:
                rb.append((j1, j2))
    return _spans(ta, ra), _spans(tb, rb)


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() if a.strip() and b.strip() else 0.0


def pair_rows(old: list[dict], new: list[dict]) -> None:
    """Pair removed with added lines that are versions of each other, in order, and mark their changed words."""
    j0 = 0
    for r in old:
        best, at = 0.45, -1
        for j in range(j0, min(len(new), j0 + 8)):
            s = _similar(r["t"], new[j]["t"])
            if s > best:
                best, at = s, j
        if at >= 0:
            r["m"], new[at]["m"] = word_marks(r["t"], new[at]["t"])
            j0 = at + 1


def blocks(rows: list[dict]) -> list[tuple[int, int]]:
    """Index ranges of rows that are changes (not context), one per run."""
    out, start = [], None
    for i, r in enumerate(rows + [{"k": " "}]):
        if r["k"] != " " and start is None:
            start = i
        elif r["k"] == " " and start is not None:
            out.append((start, i))
            start = None
    return out
