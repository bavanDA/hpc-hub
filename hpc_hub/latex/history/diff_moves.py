"""Text that moved from one place to another, shown as a move instead of a removal and an addition."""

import difflib

from .diff_words import blocks, pair_rows


def _norm(t: str) -> str:
    return " ".join(t.split())


def _real(lines: list[str]) -> list[str]:
    """Lines long enough to count: a lone brace or blank line says nothing about a move."""
    return [x for x in lines if len(x) > 3]


def _runs(files: list[dict]) -> dict[str, list]:
    """Each run of removed and of added rows as (file index, hunk, rows, the change block it is in)."""
    runs: dict[str, list] = {"-": [], "+": []}
    for fi, f in enumerate(files):
        for h in f["hunks"]:
            rows = h["rows"]
            for a, b in blocks(rows):
                i = a
                while i < b:
                    k, j = rows[i]["k"], i
                    while j < b and rows[j]["k"] == k:
                        j += 1
                    runs[k].append((fi, h, rows[i:j], (id(h), a)))
                    i = j
    return runs


def _best_match(old: list[str], block, added: list, used: set, min_lines: int):
    """The added run that is most of these removed lines, as (index, matcher), or None."""
    real, best = _real(old), None
    for k, (_, _, dst, block2) in enumerate(added):
        if k in used or block2 == block:
            continue
        new = [_norm(r["t"]) for r in dst]
        sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
        same = sum(1 for i, _, size in sm.get_matching_blocks() for x in old[i:i + size] if len(x) > 3)
        if same >= min_lines and same >= 0.6 * len(real) and same >= 0.5 * len(_real(new)):
            if not best or same > best[0]:
                best = (same, k, sm)
    return best[1:] if best else None


def _moved_rows(src: list[dict], dst: list[dict], sm: difflib.SequenceMatcher, mid: int) -> tuple[list[dict], int]:
    """The added run rewritten as a move: unchanged lines as moved, real changes as - and +. Also the change count."""
    rows, changes = [], 0
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            rows += [{**y, "o": x["o"], "mv": mid, "same": True} for x, y in zip(src[i1:i2], dst[j1:j2])]
            continue
        changes += 1
        olds = [{**x, "mv": mid, "src": True, "m": []} for x in src[i1:i2]]
        news = [{**y, "mv": mid, "m": []} for y in dst[j1:j2]]
        pair_rows(olds, news)
        rows += olds + news
    return rows, changes


def find_moves(files: list[dict], min_lines: int = 3) -> list[dict]:
    """Text that moved: a run of removed lines that comes back, mostly the same, as a run of added lines elsewhere.
    The added run is rewritten in place to show the move."""
    runs = _runs(files)
    moves, used = [], set()
    for fi, _, src, block in runs["-"]:
        old = [_norm(r["t"]) for r in src]
        if len(_real(old)) < min_lines:
            continue
        found = _best_match(old, block, runs["+"], used, min_lines)
        if not found:
            continue
        k, sm = found
        used.add(k)
        fj, h2, dst, _ = runs["+"][k]
        mid = len(moves) + 1
        for r in src:
            r["mv"] = mid
        rows, changes = _moved_rows(src, dst, sm, mid)
        at = next(i for i, r in enumerate(h2["rows"]) if r is dst[0])
        h2["rows"][at:at + len(dst)] = rows
        moves.append({"id": mid, "lines": len(src), "changes": changes,
                      "from": {"path": files[fi]["path"], "line": src[0]["o"], "end": src[-1]["o"]},
                      "to": {"path": files[fj]["path"], "line": dst[0]["n"], "end": dst[-1]["n"]}})
    return moves


def mark(files: list[dict]) -> list[dict]:
    """Moves first, then the changed words of every other change."""
    moves = find_moves(files)
    for f in files:
        for h in f["hunks"]:
            for a, b in blocks(h["rows"]):
                block = [r for r in h["rows"][a:b] if "mv" not in r]
                pair_rows([r for r in block if r["k"] == "-"], [r for r in block if r["k"] == "+"])
    return moves
