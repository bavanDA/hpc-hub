"""A paper's history, read over SSH: commits with their counts, the changes of a commit or between any two versions
(changed words marked, text that moved found), who last changed each line, and the branches and tags the pickers
offer. Paths are relative to the repository's top folder."""

import difflib
import re
import shlex

from ..core.ssh import SshMaster
from .git import BUILD_FILES, ENV, GitError

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"  # git's tree with nothing in it: the root commit's parent
ZERO = "0" * 40
SKIP = " ".join(shlex.quote(f":(top,exclude)*.{e}") for e in BUILD_FILES)  # build files are left out everywhere
DIFF_LIMIT = 3_000_000
REV_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._/@^~{}+-]*$")
FMT = "%x1e" + "%x1f".join(["%H", "%h", "%an", "%ae", "%at", "%P", "%D", "%s", "%b"]) + "%x1d"
SEP = "@@hpchub@@"


def rev(name: str) -> str:
    """A branch, tag or commit as the app may pass it on to git."""
    if not REV_RE.match(name or "") or ".." in name:
        raise GitError(f"No version {name!r}")
    return name


def g(folder: str) -> str:
    return f"{ENV} git -C {shlex.quote(folder)}"


def run(ssh: SshMaster, script: str, timeout: float = 120) -> str:
    res = ssh.run(script, timeout=timeout)
    if res.returncode != 0:
        raise GitError(res.stderr.strip() or res.stdout.strip() or "git failed")
    return res.stdout


def parts(text: str, n: int) -> list[str]:
    return (text.split(SEP + "\n") + [""] * n)[:n]


# -- commits ---------------------------------------------------------------------------------------------------
def _path(p: str) -> str:
    """numstat's rename forms (a => b, dir/{a => b}/c) -> the new path."""
    p = re.sub(r"\{[^{}]* => ([^{}]*)\}", r"\1", p)
    return re.sub(r"//+", "/", p.split(" => ")[-1])


def parse_log(text: str) -> list[dict]:
    out = []
    for rec in text.split("\x1e")[1:]:
        head, _, stats = rec.partition("\x1d")
        f = head.split("\x1f")
        if len(f) < 9:
            continue
        files = []
        for line in stats.splitlines():
            cols = line.split("\t")
            if len(cols) == 3:
                a, d, p = cols
                files.append({"path": _path(p), "added": int(a) if a.isdigit() else 0,
                              "removed": int(d) if d.isdigit() else 0, "binary": a == "-"})
        refs = [r.strip() for r in f[6].split(",") if r.strip()]
        out.append({"hash": f[0], "short": f[1], "author": f[2], "email": f[3], "time": int(f[4] or 0),
                    "parents": f[5].split(), "tags": [r[5:] for r in refs if r.startswith("tag: ")],
                    "branches": [r.removeprefix("HEAD -> ") for r in refs if not r.startswith("tag: ") and r != "HEAD"],
                    "subject": f[7], "body": f[8].strip(), "files": files,
                    "added": sum(x["added"] for x in files), "removed": sum(x["removed"] for x in files)})
    return out


def log(ssh: SshMaster, folder: str, ref: str = "HEAD", limit: int = 300, stats: bool = True) -> list[dict]:
    """Commits newest first, each with its files and lines added and removed. [] before the first commit."""
    numstat = "--numstat" if stats else ""
    res = ssh.run(f"{g(folder)} log {shlex.quote(rev(ref))} -n {int(limit)} {numstat} --no-color "
                  f"--format={shlex.quote(FMT)} --", timeout=120)
    if res.returncode != 0:
        if "does not have any commits" in res.stderr or "unknown revision" in res.stderr:
            return []
        raise GitError(res.stderr.strip() or "git log failed")
    return parse_log(res.stdout)


def commit(ssh: SshMaster, folder: str, ref: str) -> dict:
    found = parse_log(run(ssh, f"{g(folder)} log -1 --numstat --no-color --format={shlex.quote(FMT)} "
                               f"{shlex.quote(rev(ref))} --"))
    if not found:
        raise GitError(f"No commit {ref}")
    return found[0]


# -- the state of the working copy --------------------------------------------------------------------------------
def _numstat(text: str) -> list[dict]:
    out = []
    for line in text.splitlines():
        cols = line.split("\t")
        if len(cols) == 3:
            out.append({"path": _path(cols[2]), "added": int(cols[0]) if cols[0].isdigit() else 0,
                        "removed": int(cols[1]) if cols[1].isdigit() else 0, "new": False})
    return out


def state(ssh: SshMaster, folder: str) -> dict:
    """Where the paper stands, in one trip: branch, last commit, its upstream and how far apart, when origin was
    last fetched, who you are to git, the changes not committed yet (with line counts), and the saved-versions
    setting. root "" when it is not a repository."""
    q, G = shlex.quote(folder), g(folder)
    script = f"; echo {SEP}; ".join([
        f"{G} rev-parse --show-toplevel || exit 3",
        f"{G} rev-parse --absolute-git-dir",
        f"{G} rev-parse --show-prefix",
        f"{G} branch --show-current",
        f"{G} rev-parse -q --verify HEAD",
        f"r=$({G} symbolic-ref -q HEAD) && {G} for-each-ref --format='%(upstream:short)' \"$r\"",
        f"{G} rev-list --left-right --count 'HEAD...@{{u}}' 2>/dev/null",
        f"stat -c %Y \"$({G} rev-parse --absolute-git-dir)/FETCH_HEAD\" 2>/dev/null",
        f"{G} config user.name; {G} config user.email; id -un",
        f"{G} diff HEAD --numstat --no-color -- . {SKIP} 2>/dev/null",
        f"cd {q} && {ENV} git ls-files -z -o --exclude-standard -- . {SKIP} | head -z -n 300 | "
        "while IFS= read -r -d '' f; do printf '%s\\t%s\\n' \"$(wc -l < \"$f\" 2>/dev/null || echo 0)\" \"$f\"; done",
        f"{G} config hpc-hub.saved",
        f"b=$({G} branch --show-current); {G} log -1 --format=%ct \"refs/hpc-hub/saved/${{b:-detached}}\" 2>/dev/null",
        f"test -f \"$({G} rev-parse --absolute-git-dir)/hpc-hub/sync.json\" && echo yes",
        f"{G} remote",
    ]) + "; true"
    res = ssh.run(script, timeout=60)
    if res.returncode == 3:
        return {"root": ""}
    if res.returncode != 0:
        raise GitError(res.stderr.strip() or "git failed")
    p = parts(res.stdout, 15)
    root, prefix = p[0].strip(), p[2].strip()
    ahead_behind = p[6].split()
    who = p[8].splitlines() + ["", "", ""]
    changes = _numstat(p[9])
    for line in p[10].splitlines():
        n, _, path = line.partition("\t")
        if path:
            changes.append({"path": prefix + path, "added": int(n) if n.strip().isdigit() else 0, "removed": 0,
                            "new": True})
    return {"root": root, "git_dir": p[1].strip(), "prefix": prefix, "branch": p[3].strip(), "head": p[4].strip(),
            "upstream": p[5].strip(), "ahead": int(ahead_behind[0]) if len(ahead_behind) == 2 else 0,
            "behind": int(ahead_behind[1]) if len(ahead_behind) == 2 else 0,
            "fetched": int(p[7].strip() or 0), "user": who[0] or who[2], "email": who[1], "login": who[2],
            "changes": changes, "saved": (p[11].strip() or "cluster"), "saved_at": int(p[12].strip() or 0),
            "syncing": p[13].strip() == "yes", "remotes": p[14].split()}


# -- changes, with words and moves -----------------------------------------------------------------------------------
# A row: {"k": " " | "-" | "+", "o": old line or None, "n": new line or None, "t": text, "m": [[from, to], ...]
# changed words}. Rows of text that moved carry "mv" (the move's id); "same": True when the line moved unchanged;
# "src": True for a removed line shown inside the block it moved to.
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$")
TOKEN_RE = re.compile(r"\\[A-Za-z@]+|[A-Za-z]+|[0-9]+|\s+|.", re.S)


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


def _pair_rows(old: list[dict], new: list[dict]) -> None:
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


def _blocks(rows: list[dict]) -> list[tuple[int, int]]:
    """Index ranges of rows that are changes (not context), one per run."""
    out, start = [], None
    for i, r in enumerate(rows + [{"k": " "}]):
        if r["k"] != " " and start is None:
            start = i
        elif r["k"] == " " and start is not None:
            out.append((start, i))
            start = None
    return out


def _norm(t: str) -> str:
    return " ".join(t.split())


def find_moves(files: list[dict], min_lines: int = 3) -> list[dict]:
    """Text that moved: a run of removed lines that comes back, mostly the same, as a run of added lines elsewhere.
    The added run is rewritten to show the move: unchanged lines as moved, the few real changes as - and +."""
    runs: dict[str, list] = {"-": [], "+": []}  # (file index, hunk, rows of the run, the change block it is in)
    for fi, f in enumerate(files):
        for h in f["hunks"]:
            rows = h["rows"]
            for a, b in _blocks(rows):
                i = a
                while i < b:
                    k, j = rows[i]["k"], i
                    while j < b and rows[j]["k"] == k:
                        j += 1
                    runs[k].append((fi, h, rows[i:j], (id(h), a)))
                    i = j
    moves, used = [], set()
    for fi, h, src, block in runs["-"]:
        old = [_norm(r["t"]) for r in src]
        real = [x for x in old if len(x) > 3]
        if len(real) < min_lines:
            continue
        best = None
        for k, (_, _, dst, block2) in enumerate(runs["+"]):
            if k in used or block2 == block:
                continue
            new = [_norm(r["t"]) for r in dst]
            sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
            same = sum(1 for i, _, size in sm.get_matching_blocks() for x in old[i:i + size] if len(x) > 3)
            if same >= min_lines and same >= 0.6 * len(real) and same >= 0.5 * len([x for x in new if len(x) > 3]):
                if not best or same > best[0]:
                    best = (same, k, sm)
        if not best:
            continue
        _, k, sm = best
        used.add(k)
        fj, h2, dst, _ = runs["+"][k]
        mid = len(moves) + 1
        for r in src:
            r["mv"] = mid
        rows, changes = [], 0
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                rows += [{**y, "o": x["o"], "mv": mid, "same": True} for x, y in zip(src[i1:i2], dst[j1:j2])]
                continue
            changes += 1
            olds = [{**x, "mv": mid, "src": True, "m": []} for x in src[i1:i2]]
            news = [{**y, "mv": mid, "m": []} for y in dst[j1:j2]]
            _pair_rows(olds, news)
            rows += olds + news
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
            for a, b in _blocks(h["rows"]):
                block = [r for r in h["rows"][a:b] if "mv" not in r]
                _pair_rows([r for r in block if r["k"] == "-"], [r for r in block if r["k"] == "+"])
    return moves


def changes(ssh: SshMaster, folder: str, frm: str = "", to: str = "", context: int = 3) -> dict:
    """What changed from one version to another. to "" is the files now (new files too, build files left out);
    frm "" is to's parent (HEAD for the files now)."""
    G = g(folder)
    if to:
        to = rev(to)
        if not frm:
            parents = run(ssh, f"{G} rev-list --parents -n 1 {shlex.quote(to)}").split()
            frm = parents[1] if len(parents) > 1 else EMPTY_TREE
        script = (f"{G} diff --no-color --no-ext-diff -M -U{int(context)} {shlex.quote(rev(frm))} {shlex.quote(to)} "
                  f"-- :/ {SKIP} | head -c {DIFF_LIMIT}")
    else:
        has_head = ssh.run(f"{G} rev-parse -q --verify HEAD", timeout=30).returncode == 0
        frm = rev(frm) if frm else ("HEAD" if has_head else EMPTY_TREE)
        q = shlex.quote(folder)
        # new files are not in git yet: each one as a diff against nothing, without touching the index
        new = (f"cd {q} && {ENV} git ls-files -z -o --exclude-standard -- . {SKIP} | head -z -n 100 | "
               f"while IFS= read -r -d '' f; do {ENV} git diff --no-color --no-index -- /dev/null \"$f\"; done")
        script = (f"{G} rev-parse --show-prefix; echo {SEP}; "
                  f"{G} diff --no-color --no-ext-diff -M -U{int(context)} {shlex.quote(frm)} -- . {SKIP} "
                  f"| head -c {DIFF_LIMIT}; echo {SEP}; {new} | head -c {DIFF_LIMIT}")
    res = ssh.run(script, timeout=180)
    if res.returncode != 0 and not res.stdout:
        raise GitError(res.stderr.strip() or "git diff failed")
    if to:
        files = parse_diff(res.stdout)
        size = len(res.stdout)
    else:
        prefix, tracked, untracked = parts(res.stdout, 3)
        files = parse_diff(tracked)
        for f in parse_diff(untracked):  # named from the project folder: from the top, like the rest
            f.update(path=prefix.strip() + f["path"], old_path="", status="A")
            files.append(f)
        size = max(len(tracked), len(untracked))
    for f in files:
        if f["status"] == "A":
            f["old_path"] = ""
    moves = mark(files)
    return {"from": frm, "to": to, "files": files, "moves": moves, "truncated": size >= DIFF_LIMIT,
            "added": sum(f["added"] for f in files), "removed": sum(f["removed"] for f in files)}


# -- who changed each line -----------------------------------------------------------------------------------------
def parse_blame(text: str) -> dict:
    commits: dict[str, dict] = {}
    lines: list[list] = []
    cur = None
    for line in text.split("\n"):
        if line.startswith("\t"):
            if cur:
                lines.append([cur[0], cur[1]])
            continue
        head = line.split(" ")
        if len(head) >= 3 and len(head[0]) == 40 and all(c in "0123456789abcdef" for c in head[0]):
            cur = (head[0], int(head[1]))
            commits.setdefault(head[0], {"hash": head[0], "author": "", "time": 0, "summary": "", "path": "",
                                         "previous": None, "uncommitted": head[0] == ZERO})
        elif cur:
            c, (key, _, value) = commits[cur[0]], line.partition(" ")
            if key == "author":
                c["author"] = value
            elif key == "author-time":
                c["time"] = int(value or 0)
            elif key == "summary":
                c["summary"] = value
            elif key == "filename":
                c["path"] = value
            elif key == "previous":
                h, _, p = value.partition(" ")
                c["previous"] = {"hash": h, "path": p}
    return {"commits": commits, "lines": lines}


def relpath(folder: str, path: str) -> str:
    """A path the app sends (absolute in the project, or relative to it) as git takes it from the project folder."""
    if path.startswith(folder.rstrip("/") + "/"):
        return path[len(folder.rstrip("/")) + 1:]
    if path.startswith("/") or ".." in path.split("/"):
        raise GitError("That file is outside the project")
    return path


def blame(ssh: SshMaster, folder: str, path: str, at: str = "", lines: tuple[int, int] | None = None) -> dict:
    """Who last changed each line ({commits by hash, lines: [[hash, line in that commit], ...]}). at "" is the file
    now: lines not committed yet have the zero hash."""
    span = f"-L {int(lines[0])},{int(lines[1])}" if lines else ""
    if at:  # a path from the repository's top
        if path.startswith("/") or ".." in path.split("/"):
            raise GitError("Bad path")
        cmd = (f"cd {shlex.quote(folder)} && cd \"$(git rev-parse --show-toplevel)\" && {ENV} git blame --porcelain -w "
               f"{span} {shlex.quote(rev(at))} -- {shlex.quote(path)}")
    else:
        cmd = f"{g(folder)} blame --porcelain -w {span} -- {shlex.quote(relpath(folder, path))}"
    return parse_blame(run(ssh, cmd, timeout=120))


def line_story(ssh: SshMaster, folder: str, path: str, line: int, at: str = "") -> dict:
    """The commit that last changed one line: its message, the line before and after, how many more lines the
    commit changed, and where the line came from before that (to follow it further back)."""
    b = blame(ssh, folder, path, at, (line, line))
    if not b["lines"]:
        raise GitError("No such line")
    h, orig = b["lines"][0]
    c = b["commits"][h]
    if c["uncommitted"]:
        return {"uncommitted": True, "line": line}
    full = commit(ssh, folder, h)
    diff = changes(ssh, folder, "", h, context=0)
    rows = [r for f in diff["files"] if f["path"] == c["path"] for hk in f["hunks"] for r in hk["rows"]]
    after = next((i for i, r in enumerate(rows) if r["k"] == "+" and r["n"] == orig), -1)
    pair = []
    if after >= 0:
        before = next((r for r in reversed(rows[:after]) if r["k"] == "-" and r["m"]), None) \
            if rows[after]["m"] else None
        pair = ([before] if before else []) + [rows[after]]
    older = None
    prev = c["previous"]
    if prev and pair and pair[0]["k"] == "-":
        try:
            ob = blame(ssh, folder, prev["path"], prev["hash"], (pair[0]["o"], pair[0]["o"]))
            oh, _ = ob["lines"][0]
            oc = ob["commits"][oh]
            older = {"rev": prev["hash"], "path": prev["path"], "line": pair[0]["o"], "hash": oh,
                     "subject": oc["summary"], "author": oc["author"], "time": oc["time"]}
        except GitError:
            older = None
    shown = len(pair)
    return {"uncommitted": False, "commit": {k: v for k, v in full.items() if k != "files"}, "path": c["path"],
            "line": orig, "rows": pair, "more": max(0, full["added"] + full["removed"] - shown), "older": older}


def file_at(ssh: SshMaster, folder: str, at: str, path: str) -> str:
    """A file as it was in a version (path from the repository's top)."""
    if path.startswith("/") or ".." in path.split("/"):
        raise GitError("Bad path")
    return run(ssh, f"{g(folder)} show {shlex.quote(rev(at) + ':' + path)} | head -c 8000000")


# -- branches and tags, for the pickers -------------------------------------------------------------------------------
REF_FMT = "%(refname)%1f%(objectname)%1f%(committerdate:unix)%1f%(authorname)%1f%(upstream:short)%1f%(subject)"


def refs(ssh: SshMaster, folder: str) -> dict:
    """Your branches (with how many commits each has that yours doesn't), branches only on a remote, tags, and the
    quick picks: the last pull and your last commit."""
    G = g(folder)
    script = (f"{G} for-each-ref --sort=-committerdate --count=400 --format={shlex.quote(REF_FMT)}"
              f" refs/heads refs/remotes refs/tags; echo {SEP}; "
              f"{G} branch --show-current; echo {SEP}; "
              f"for b in $({G} for-each-ref --sort=-committerdate --count=40 --format='%(refname:short)' refs/heads); "
              f"do printf '%s\\t%s\\n' \"$b\" \"$({G} rev-list --count \"HEAD..$b\" 2>/dev/null)\"; done; echo {SEP}; "
              f"{G} reflog -n 400 --format='%H%x1f%ct%x1f%gs' HEAD 2>/dev/null; echo {SEP}; "
              f"e=$({G} config user.email); "
              f"{G} log -1 --format='%H%x1f%ct%x1f%s' --author=\"${{e:-$(id -un)}}\" 2>/dev/null; true")
    p = parts(run(ssh, script, timeout=60), 5)
    current = p[1].strip()
    new = dict(line.split("\t", 1) for line in p[2].splitlines() if "\t" in line)
    branches, remote, tags = [], [], []
    for line in p[0].splitlines():
        f = line.split("\x1f")
        if len(f) < 6:
            continue
        name, item = f[0], {"hash": f[1], "time": int(f[2] or 0), "author": f[3], "subject": f[5]}
        if name.startswith("refs/heads/"):
            short = name[11:]
            branches.append({**item, "name": short, "upstream": f[4], "current": short == current,
                             "new": int(new.get(short, "0") or 0)})
        elif name.startswith("refs/remotes/") and not name.endswith("/HEAD"):
            remote.append({**item, "name": name[13:]})
        elif name.startswith("refs/tags/"):
            tags.append({**item, "name": name[10:]})
    local = {b["name"] for b in branches}
    ups = {b["upstream"] for b in branches}
    only = [{**r, "local": r["name"].split("/", 1)[-1]} for r in remote
            if r["name"] not in ups and r["name"].split("/", 1)[-1] not in local
            and not r["name"].split("/", 1)[-1].startswith("saved/")]
    pull = next((x.split("\x1f") for x in p[3].splitlines() if x.count("\x1f") == 2
                 and x.split("\x1f")[2].startswith("pull")), [])
    mine = p[4].strip().split("\x1f")
    return {"current": current, "branches": branches, "remote": remote, "remote_only": only, "tags": tags,
            "last_pull": {"hash": pull[0], "time": int(pull[1])} if len(pull) == 3 else None,
            "mine": {"hash": mine[0], "time": int(mine[1]), "subject": mine[2]} if len(mine) == 3 else None}


def lanes(ssh: SshMaster, folder: str, a: str, b: str) -> dict:
    """Two branches side by side: where they split, and the commits only on each."""
    G, qa, qb = g(folder), shlex.quote(rev(a)), shlex.quote(rev(b))
    base = run(ssh, f"{G} merge-base {qa} {qb} || true").strip()
    fmt = shlex.quote(FMT)
    p = parts(run(ssh, f"{G} log -n 200 --no-color --format={fmt} {qb}..{qa} --; echo {SEP}; "
                       f"{G} log -n 200 --no-color --format={fmt} {qa}..{qb} --"), 2)
    return {"base": base, "a": a, "b": b, "only_a": parse_log(p[0]), "only_b": parse_log(p[1])}
