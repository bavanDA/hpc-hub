"""Where a paper's repository stands, read in one trip."""

import shlex

from ...core.ssh import SshMaster
from ..git import ENV, GitError
from ..git_shell import SEP, SKIP, g, parts
from .commits import numstat


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
    changes = [{"path": f["path"], "added": f["added"], "removed": f["removed"], "new": False}
               for f in numstat(p[9])]
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
