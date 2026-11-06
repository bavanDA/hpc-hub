"""A change as plain text for a prompt, trimmed to fit."""

DIFF_LIMIT = 24_000  # characters of diff in one prompt
FILE_LIMIT = 8_000  # of one file's part of it
CONTEXT_LINES = 12  # around the lines a question is about


def _file_head(f: dict) -> str:
    extra = {"A": " (new file)", "D": " (deleted)",
             "R": f" (renamed from {f.get('old_path', '')})"}.get(f["status"], "")
    return f"--- {f['path']}{extra}{' (binary)' if f.get('binary') else ''}"


def diff_text(changes: dict, limit: int = DIFF_LIMIT, file_limit: int = FILE_LIMIT) -> str:
    """A plain unified diff from history.changes, each file and the whole trimmed at a line, saying what was left
    out. Lines that moved show once, where they went."""
    out: list[str] = []
    size, left = 0, []
    for f in changes.get("files", []):
        rows = [_file_head(f)]
        for h in f.get("hunks", []):
            rows.append(f"@@ -{h['old']} +{h['new']} @@ {h.get('header', '')}".rstrip())
            rows += [f"{r['k']}{r['t']}" for r in h["rows"] if not r.get("src")]
        text = _cut(rows, file_limit, "of this file")
        if size + len(text) > limit and out:
            left.append(f["path"])
            continue
        text = _cut(text.split("\n"), limit - size, "of the change")
        out.append(text)
        size += len(text) + 1
    if left:
        out.append(f"[Also changed, not shown: {', '.join(left)}]")
    return "\n".join(out)


def _cut(rows: list[str], limit: int, what: str) -> str:
    kept, n = [], 0
    for i, r in enumerate(rows):
        if n + len(r) + 1 > limit and kept:
            kept.append(f"[{len(rows) - i} more lines {what} left out]")
            break
        kept.append(r)
        n += len(r) + 1
    return "\n".join(kept)


def numbered(text: str, line: int, end: int, around: int = CONTEXT_LINES) -> str:
    """The lines line..end of a file with some around them, each with its number ("  23| ...")."""
    rows = text.split("\n")
    a, b = max(1, line - around), min(len(rows), max(line, end) + around)
    return "\n".join(f"{n:5d}| {rows[n - 1]}" for n in range(a, b + 1))
