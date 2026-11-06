"""Branches, remote branches, tags and the quick picks of the version menu."""

import shlex

from ...core.ssh import SshMaster
from ..git_shell import SEP, g, parts, run

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
