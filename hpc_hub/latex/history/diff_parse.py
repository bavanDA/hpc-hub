"""git diff output as files, hunks and rows."""

import re

# A row: {"k": " " | "-" | "+", "o": old line or None, "n": new line or None, "t": text, "m": [[from, to], ...]
# changed words}. Rows of text that moved carry "mv" (the move's id); "same": True when the line moved unchanged;
# "src": True for a removed line shown inside the block it moved to.
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$")


def _unquote(p: str) -> str:
    if p.startswith('"') and p.endswith('"'):
        p = p[1:-1].encode("latin-1", "backslashreplace").decode("unicode_escape").encode("latin-1").decode("utf-8",
                                                                                                         "replace")
    return p


def parse_diff(text: str) -> list[dict]:
    files: list[dict] = []
    cur, hunk, o, n = None, None, 0, 0
    for line in text.split("\n"):
        if line.startswith("diff --git ") or line.startswith("diff --cc "):
            m = re.match(r'diff --git "?a/(.*?)"? "?b/(.*?)"?$', line)
            cur = {"path": m.group(2) if m else "", "old_path": m.group(1) if m else "", "status": "M",
                   "binary": False, "added": 0, "removed": 0, "hunks": []}
            files.append(cur)
            hunk = None
        elif cur is None:
            continue
        elif hunk is None and not line.startswith("@@"):
            if line.startswith("new file mode"):
                cur["status"] = "A"
            elif line.startswith("deleted file mode"):
                cur["status"] = "D"
            elif line.startswith("rename from "):
                cur["old_path"], cur["status"] = _unquote(line[12:]), "R"
            elif line.startswith("rename to "):
                cur["path"] = _unquote(line[10:])
            elif line.startswith("Binary files") or line.startswith("GIT binary patch"):
                cur["binary"] = True
            elif line.startswith("--- "):
                old = _unquote(line[4:])
                cur["old_path"] = old[2:] if old.startswith("a/") else cur["old_path"]
            elif line.startswith("+++ "):
                new = _unquote(line[4:])
                if new.startswith("b/"):
                    cur["path"] = new[2:]
        elif line.startswith("@@"):
            m = HUNK_RE.match(line)
            if m:
                o, n = int(m.group(1)), int(m.group(2))
                hunk = {"old": o, "new": n, "header": m.group(3).strip(), "rows": []}
                cur["hunks"].append(hunk)
        elif hunk is not None and line[:1] in (" ", "-", "+"):
            k, t = line[0], line[1:]
            if k == " ":
                hunk["rows"].append({"k": " ", "o": o, "n": n, "t": t, "m": []})
                o, n = o + 1, n + 1
            elif k == "-":
                hunk["rows"].append({"k": "-", "o": o, "n": None, "t": t, "m": []})
                o += 1
                cur["removed"] += 1
            else:
                hunk["rows"].append({"k": "+", "o": None, "n": n, "t": t, "m": []})
                n += 1
                cur["added"] += 1
    return files
