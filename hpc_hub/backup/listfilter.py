"""The copy job's file list, made on the cluster from the scan's files.list0 and the plan's rules (plan.py):
copy.list0 (to project) and copy-home.list0 (code to home on Expanse), relative paths, NUL-ended, for rsync's
--files-from. Files changed in the last 30 minutes are left for later: a job is probably still writing them.

It only reads the list and stats the chosen files (metadata). Standard library only, syntax old clusters' Python 3
reads.

python3 -I listfilter.py SCRATCH DIR NOW"""

import fnmatch
import json
import os
import sys

SEP = "\x1f"
BUSY_SECONDS = 1800
DEPTH = 3


def folder_of(path):
    """Same as summarize.folder_of: the first DEPTH levels; a repository's .git goes with the repository."""
    parts = path.split("/")[:-1]
    if ".git" in parts:
        parts = parts[:parts.index(".git")]
    return "/".join(parts[:DEPTH]) or "."


def rule_for(rules, folder, cls, name):
    """A pattern for this folder and name first, then the rule for this kind of file in it."""
    for r in rules:
        if r.get("glob") and r["folder"] == folder and fnmatch.fnmatchcase(name, r["glob"]):
            return r
    for r in rules:
        if not r.get("glob") and r["folder"] == folder and r.get("class") == cls:
            return r
    return None


def records(path):
    with open(path, "rb") as fh:
        data = fh.read()
    for rec in data.split(b"\0"):
        if rec:
            f = os.fsdecode(rec).split(SEP, 5)
            if len(f) == 6:
                yield f


def main(scratch, out, now):
    with open(os.path.join(out, "rules.json")) as fh:
        plan = json.load(fh)
    rules, horizon, scope = plan["rules"], plan["horizon"], plan["scope"]
    chosen = {"project": [], "home": []}
    newest = {}  # rule index -> [(mtime, path, size, to)] left out, of which the newest n go anyway
    busy = []
    for cls, size, left, mtime, kind, path in records(os.path.join(out, "files.list0")):
        if scope == "at_risk" and (left == "" or int(left) > horizon):
            continue
        r = rule_for(rules, folder_of(path), cls, os.path.basename(path))
        if r is None:
            continue
        if r["keep"]:
            chosen[r.get("to", "project")].append((path, int(size)))
        elif r.get("except_newest"):
            newest.setdefault(rules.index(r), []).append((int(mtime), path, int(size), r.get("to", "project")))
    for i, files in newest.items():
        for _, path, size, to in sorted(files, reverse=True)[:rules[i]["except_newest"]]:
            chosen[to].append((path, size))
    totals = {"files": 0, "bytes": 0}
    for to, name in (("project", "copy.list0"), ("home", "copy-home.list0")):
        with open(os.path.join(out, name), "wb") as fh:
            for path, size in sorted(chosen[to]):
                try:
                    st = os.lstat(os.path.join(scratch, path))
                except OSError:
                    continue  # gone since the scan
                if now - st.st_mtime < BUSY_SECONDS:
                    busy.append(path)
                    continue
                fh.write(os.fsencode(path) + b"\0")
                totals["files"] += 1
                totals["bytes"] += size
    with open(os.path.join(out, "filter.json"), "w") as fh:
        json.dump(dict(totals, hash=plan["hash"], busy=busy[:500], busy_count=len(busy)), fh)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]))
