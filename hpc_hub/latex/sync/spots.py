"""The spots git could not settle in a file, and the file with each one settled."""

from ..git import GitError


def blocks(text: str) -> list[dict]:
    """The spots git could not settle in a file, with conflictStyle diff3. The top side is what came in (theirs),
    the bottom side yours: in a rebase your commit is the one replayed, when your changes come back they are the
    patch."""
    rows, out, i = text.split("\n"), [], 0
    while i < len(rows):
        if rows[i].startswith("<<<<<<<"):
            start, side, b = i, "theirs", {"theirs": [], "base": [], "mine": []}
            i += 1
            while i < len(rows) and not rows[i].startswith(">>>>>>>"):
                if rows[i].startswith("|||||||"):
                    side = "base"
                elif rows[i] == "=======" or rows[i].startswith("======= "):
                    side = "mine"
                else:
                    b[side].append(rows[i])
                i += 1
            out.append({**b, "line": start + 1, "end": i + 1, "before": rows[max(0, start - 2):start],
                        "after": rows[i + 1:i + 3]})
        i += 1
    return out


def resolve(text: str, picks: list[dict]) -> str:
    """Each spot replaced by what was picked for it: mine, theirs, both (yours first), or edit (its text)."""
    rows, out, i, n = text.split("\n"), [], 0, 0
    found = blocks(text)
    if len(picks) != len(found):
        raise GitError("Pick something for every spot first")
    while i < len(rows):
        if rows[i].startswith("<<<<<<<"):
            b, p = found[n], picks[n]
            take = p.get("take")
            out += (b["mine"] if take == "mine" else b["theirs"] if take == "theirs"
                    else b["mine"] + b["theirs"] if take == "both" else str(p.get("text", "")).split("\n"))
            i, n = b["end"], n + 1
            continue
        out.append(rows[i])
        i += 1
    return "\n".join(out)
