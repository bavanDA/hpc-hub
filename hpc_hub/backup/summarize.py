"""The scan's summary, run on the cluster over find's output (scan.py): per folder totals, what the timer deletes
when, what kind of files they are, and the full file list the copy job filters later.

Input on stdin: one record per file or link, NUL-ended, fields separated by \\037 (find -printf):
atime mtime ctime btime size blocks links type target path. It only reads that stream; it never opens a file.

Runs as `python3 -I` with classify.py pasted in front (scan.remote_source), so: standard library only, syntax old
clusters' Python 3 reads, and the import below is dropped on the cluster."""

import heapq
import json
import os
import sys
import time

from hpc_hub.backup.classify import classify  # local only: on the cluster classify.py is pasted above

SEP = "\x1f"
BIGGEST = 30
PROGRESS_EVERY = 200000


def when(atime, mtime, ctime, btime, basis):
    """The date the purge timer counts from, and whether it is a guess (no birth time for "created")."""
    if basis == "mtime":
        return mtime, False
    if basis == "atime":
        return atime, False
    if basis == "created":
        return (btime, False) if btime > 0 else (min(mtime, ctime), True)
    dates = [atime, mtime, ctime] + ([btime] if btime > 0 else [])
    return min(dates), False


def number(text):
    try:
        return float(text)
    except ValueError:
        return 0.0  # find prints "-" or "?" for an unknown birth time


def records(stream):
    """NUL-ended records from a binary stream, decoded as file names are (surrogates for odd bytes)."""
    buf = b""
    while True:
        chunk = stream.read(1 << 20)
        if not chunk:
            break
        buf += chunk
        *done, buf = buf.split(b"\0")
        for rec in done:
            if rec:
                yield os.fsdecode(rec)
    if buf:
        yield os.fsdecode(buf)


def folder_of(path, depth):
    """The folder a file is counted in: its first depth levels; a repository's .git goes with the repository."""
    parts = path.split("/")[:-1]
    if ".git" in parts:
        parts = parts[:parts.index(".git")]
    return "/".join(parts[:depth]) or "."


def new_folder(path):
    return {"path": path, "bytes": 0, "apparent_bytes": 0, "files": 0, "at_risk_files": 0, "at_risk_bytes": 0,
            "soonest_days": None, "kind": "unsure", "by_class": {}, "git": False, "busy": False, "links_out": 0,
            "sparse": 0, "hardlinks": 0, "biggest": []}


def outside(scratch, path, target):
    """A link that leads out of scratch, or nowhere."""
    if not target:
        return True
    full = target if target.startswith("/") else os.path.normpath(os.path.join(scratch, os.path.dirname(path), target))
    if not os.path.lexists(full):
        return True
    root = os.path.realpath(scratch)
    real = os.path.realpath(full)
    return not (real == root or real.startswith(root + os.sep))


def summarize(stream, args, out):
    folders, deadlines = {}, {}
    totals = {"files": 0, "bytes": 0, "at_risk_files": 0, "at_risk_bytes": 0, "soonest_days": None,
              "hardlinks": 0, "guessed_dates": 0}
    busy = [b.strip("/") for b in args["busy"] if b.strip("/")]
    days, basis, horizon, now = args["days"], args["basis"], args["horizon"], args["now"]
    listing = open(os.path.join(out, "files.list0"), "wb")
    n = 0
    for rec in records(stream):
        f = rec.split(SEP, 9)
        if len(f) != 10:
            continue
        atime, mtime, ctime, btime = (number(x) for x in f[:4])
        size, blocks, nlink = (int(number(x)) for x in f[4:7])
        kind, target, path = f[7], f[8], f[9]
        if path.startswith("/"):  # lfs find's candidates come as full paths
            path = os.path.relpath(path, args["scratch"])
        stamp, guessed = when(atime, mtime, ctime, btime, basis)
        left = days - int((now - stamp) // 86400) if days > 0 else None
        cls = classify(path, size)
        risk = left is not None and left <= horizon
        disk = blocks * 512
        n += 1
        totals["files"] += 1
        totals["bytes"] += disk
        totals["guessed_dates"] += 1 if guessed else 0
        key = folder_of(path, args["depth"])
        fo = folders.get(key) or folders.setdefault(key, new_folder(key))
        fo["files"] += 1
        fo["bytes"] += disk
        fo["apparent_bytes"] += size
        c = fo["by_class"].setdefault(cls, {"files": 0, "bytes": 0, "at_risk_files": 0, "at_risk_bytes": 0})
        c["files"] += 1
        c["bytes"] += disk
        if "/.git/" in "/" + path + "/":
            fo["git"] = True
        if kind == "l" and outside(args["scratch"], path, target):
            fo["links_out"] += 1
        if kind == "f" and size > (1 << 20) and disk < size // 2:
            fo["sparse"] += 1
        if kind == "f" and nlink > 1:
            fo["hardlinks"] += 1
            totals["hardlinks"] += 1
        if risk:
            totals["at_risk_files"] += 1
            totals["at_risk_bytes"] += disk
            fo["at_risk_files"] += 1
            fo["at_risk_bytes"] += disk
            c["at_risk_files"] += 1
            c["at_risk_bytes"] += disk
            d = deadlines.setdefault(max(left, 0), [0, 0])
            d[0] += 1
            d[1] += disk
            for t in (totals, fo):
                if t["soonest_days"] is None or left < t["soonest_days"]:
                    t["soonest_days"] = left
        heap = fo["biggest"]
        entry = (disk, path, cls, left)
        if len(heap) < BIGGEST:
            heapq.heappush(heap, entry)
        elif disk > heap[0][0]:
            heapq.heapreplace(heap, entry)
        line = SEP.join([cls, str(size), "" if left is None else str(left), str(int(mtime)), kind, path])
        listing.write(os.fsencode(line) + b"\0")
        if n % PROGRESS_EVERY == 0:
            write_json(os.path.join(out, "progress.json"), {"checked": n, "expected": args["expected"]})
    listing.close()
    for fo in folders.values():
        fo["busy"] = any(fo["path"] == b or fo["path"].startswith(b + "/") or b.startswith(fo["path"] + "/")
                         for b in busy)
        risky = {k: v["at_risk_bytes"] for k, v in fo["by_class"].items() if v["at_risk_bytes"]}
        if risky:
            fo["kind"] = max(sorted(risky), key=lambda k: risky[k])
        elif fo["by_class"]:
            fo["kind"] = max(sorted(fo["by_class"]), key=lambda k: fo["by_class"][k]["bytes"])
        fo["biggest"] = [[p, b, c, d] for b, p, c, d in sorted(fo["biggest"], reverse=True)]
    rc = ""
    try:
        with open(os.path.join(out, "find.rc")) as fh:
            rc = fh.read().strip()
    except OSError:
        pass
    summary = dict(totals, id=args["id"], scratch=args["scratch"], started=int(now), horizon_days=horizon,
                   purge={"days": days, "basis": basis}, partial=rc == "124",
                   deadlines=[{"days": k, "files": v[0], "bytes": v[1]} for k, v in sorted(deadlines.items())],
                   folders=sorted(folders.values(), key=lambda x: (-x["at_risk_bytes"], -x["bytes"], x["path"])))
    write_json(os.path.join(out, "summary.json"), summary)
    write_json(os.path.join(out, "progress.json"), {"checked": n, "expected": args["expected"], "done": True})
    return summary


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh)
    os.replace(tmp, path)


def parse_args(argv):
    args = {"now": time.time(), "days": 0, "basis": "oldest", "horizon": 14, "depth": 3, "busy": "", "expected": 0,
            "out": ".", "id": "", "scratch": ""}
    it = iter(argv)
    for flag in it:
        key, value = flag.lstrip("-"), next(it)
        if key in ("now",):
            args[key] = float(value)
        elif key in ("days", "horizon", "depth", "expected"):
            args[key] = int(value)
        else:
            args[key] = value
    busy = args.pop("busy") or ""
    args["busy"] = []
    try:
        with open(busy) as fh:  # running jobs' working folders (squeue %Z), made relative to scratch
            root = os.path.realpath(args["scratch"])
            for line in fh:
                p = os.path.realpath(line.strip())
                if line.strip() and (p == root or p.startswith(root + os.sep)):
                    args["busy"].append(os.path.relpath(p, root))
    except OSError:
        pass
    return args


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    summarize(sys.stdin.buffer, args, args["out"])


if __name__ == "__main__":
    main()
