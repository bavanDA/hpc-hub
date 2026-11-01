"""The agent's view of scratch, built on the cluster after the scan (agent.py): for the folders that matter, a short
tree, the README's start, the first lines of the job and driver scripts, and git facts, all under DIR/context/.
The agent then reads only that folder, never scratch itself.

Reads open files with O_NOATIME, so reading never resets the purge timer; a file that can't be read that way
(someone else's) is left out. git runs with --no-optional-locks, so it writes nothing in scratch. Standard library
only, syntax old clusters' Python 3 reads.

python3 -I context.py SCRATCH DIR"""

import fnmatch
import json
import os
import subprocess
import sys

MAX_FOLDERS = 60
TREE = 200
README_BYTES = 8192
SCRIPTS = 5
SCRIPT_LINES = 80
SCRIPT_GLOBS = ["*.sbatch", "*.slurm", "*.sh", "*.py", "*.R", "*.jl", "Makefile", "Snakefile", "*.m"]
NOATIME = getattr(os, "O_NOATIME", 0)


def head(path, limit):
    """The start of a file, read without touching its access time; None when that isn't allowed."""
    try:
        fd = os.open(path, os.O_RDONLY | NOATIME)
    except OSError:
        return None
    try:
        return os.read(fd, limit).decode("utf-8", "replace")
    finally:
        os.close(fd)


def tree(root, limit):
    """Up to limit entries under root, breadth first, metadata only."""
    out, queue = [], [""]
    while queue and len(out) < limit:
        rel = queue.pop(0)
        try:
            entries = sorted(os.scandir(os.path.join(root, rel)), key=lambda e: e.name)
        except OSError:
            continue
        for e in entries:
            if len(out) >= limit:
                break
            path = os.path.join(rel, e.name)
            if e.is_dir(follow_symlinks=False):
                out.append(path + "/")
                if e.name != ".git":
                    queue.append(path)
            else:
                out.append(path)
    return out


def git_facts(repo):
    def run(*args):
        try:
            return subprocess.run(["git", "--no-optional-locks", "-C", repo, *args], stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, universal_newlines=True, timeout=30).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""
    status = run("status", "-b", "--porcelain")
    return {"remote": run("remote", "get-url", "origin"), "status": status[:2000],
            "unpushed": run("rev-list", "--count", "@{u}..HEAD"), "dirty": len(status.splitlines()) > 1}


def picks(summary):
    """Folders the agent should look at: at risk and not plainly sorted (unknown kinds, checkpoints, git)."""
    out = []
    for f in summary.get("folders", []):
        classes = set(f.get("by_class", {}))
        if f.get("at_risk_files") and (classes & {"unsure", "checkpoint", "regen"} or f.get("git")):
            out.append(f)
    return sorted(out, key=lambda f: -f.get("at_risk_bytes", 0))[:MAX_FOLDERS]


def main(scratch, out):
    with open(os.path.join(out, "summary.json")) as fh:
        summary = json.load(fh)
    ctx = os.path.join(out, "context")
    os.makedirs(ctx, exist_ok=True)
    index = []
    for n, f in enumerate(picks(summary), 1):
        root = os.path.join(scratch, f["path"]) if f["path"] != "." else scratch
        here = os.path.join(ctx, str(n))
        os.makedirs(here, exist_ok=True)
        names = tree(root, TREE)
        with open(os.path.join(here, "tree.txt"), "w") as fh:
            fh.write("\n".join(names))
        for name in names:
            if os.path.basename(name).lower().startswith("readme") and not name.endswith("/"):
                text = head(os.path.join(root, name), README_BYTES)
                if text is not None:
                    with open(os.path.join(here, "readme.txt"), "w") as fh:
                        fh.write(text)
                    break
        scripts = [x for x in names if any(fnmatch.fnmatch(os.path.basename(x), g) for g in SCRIPT_GLOBS)]
        with open(os.path.join(here, "scripts.txt"), "w") as fh:
            for name in scripts[:SCRIPTS]:
                text = head(os.path.join(root, name), 64 * 1024)
                if text is not None:
                    fh.write("==> " + name + " <==\n" + "\n".join(text.splitlines()[:SCRIPT_LINES]) + "\n\n")
        git = git_facts(root) if os.path.isdir(os.path.join(root, ".git")) else None
        if git is not None:
            with open(os.path.join(here, "git.json"), "w") as fh:
                json.dump(git, fh)
        index.append({"n": n, "path": f["path"], "at_risk_bytes": f.get("at_risk_bytes", 0),
                      "soonest_days": f.get("soonest_days"), "by_class": f.get("by_class", {}),
                      "biggest": f.get("biggest", [])[:10], "git": git is not None})
    with open(os.path.join(ctx, "index.json"), "w") as fh:
        json.dump(index, fh)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
