"""Saved versions: the paper as it was at a save or a compile, kept between commits.

Each one is a real commit on a private ref, refs/hpc-hub/saved/<branch>: not a branch, never part of a normal push.
It is made with a temporary index (git read-tree, add, write-tree, commit-tree), so your index and files are never
touched. Its first parent is the saved version before it, its second the commit you were on. At most one every 5
minutes, none when nothing changed; older than 30 days they are cleared. The setting lives in the repository's own
config (hpc-hub.saved): off, cluster (the default) or backup (also pushed to origin as saved/<you>/<branch>)."""

import posixpath
import shlex
import threading
import time

from ..core.ssh import SshMaster
from .git import BUILD_FILES, ENV, GitError
from .history import g, rev, run

GAP = 300  # seconds between two automatic versions
KEEP_DAYS = 30
BIG = "10M"  # new files bigger than this stay out of a version (data, not writing)
SETTINGS = ("off", "cluster", "backup")
SKIP = " ".join(shlex.quote(f":(top,exclude)*.{e}") for e in BUILD_FILES)
IDENTITY = ('n=$(git config user.name || id -un); e=$(git config user.email || echo "$(id -un)@$(hostname)"); '
            'export GIT_AUTHOR_NAME="$n" GIT_AUTHOR_EMAIL="$e" GIT_COMMITTER_NAME="$n" GIT_COMMITTER_EMAIL="$e"')


def tree_script(folder: str, new_files: bool = True) -> str:
    """Shell that cds to the project and leaves the tree of its files now in $tree (and HEAD in $head). Without
    new_files only changes to files git has are in it."""
    return (f"cd {shlex.quote(folder)} && export {ENV} && gd=$(git rev-parse --absolute-git-dir) && "
            'export GIT_INDEX_FILE="$gd/hpc-hub-index.$$" && rm -f "$GIT_INDEX_FILE" && big="$gd/hpc-hub-big.$$" && '
            'head=$(git rev-parse -q --verify HEAD); { [ -z "$head" ] || git read-tree HEAD; } && '
            f"git ls-files -z -o --exclude-standard -- . {SKIP} | "
            f"xargs -0 -r sh -c 'find \"$@\" -maxdepth 0 -type f -size +{BIG} -print0' sh > \"$big\"; "
            f"git add {'-A' if new_files else '-u'} -- . {SKIP} && "
            f"xargs -0 -r git rm -q --cached --ignore-unmatch -- < \"$big\"; "
            'tree=$(git write-tree); rm -f "$GIT_INDEX_FILE" "$big"; unset GIT_INDEX_FILE; [ -n "$tree" ]')


def snapshot(ssh: SshMaster, folder: str, message: str, new_files: bool = True) -> dict:
    """A commit of the files now (parent: HEAD), on no ref. {commit, tree, head}."""
    script = (f"{tree_script(folder, new_files)} && {IDENTITY} && "
              'c=$(git commit-tree "$tree" ${head:+-p "$head"} -m ' + shlex.quote(message) + ') && '
              'echo "$c $tree $head"')
    out = run(ssh, script).split()
    return {"commit": out[0], "tree": out[1], "head": out[2] if len(out) > 2 else ""}


def _ref(branch: str) -> str:
    return f"refs/hpc-hub/saved/{rev(branch) if branch else 'detached'}"


def save(ssh: SshMaster, folder: str, kind: str = "Saved", force: bool = False) -> dict:
    """Keep a version now, unless the setting is off, the last one is under 5 minutes old (force skips that), or
    nothing changed. {saved: hash or "", why: off|soon|same|clean|""}."""
    now = int(time.time())
    script = (f"{tree_script(folder)} && "
              'setting=$(git config hpc-hub.saved || echo cluster); b=$(git branch --show-current); '
              'ref="refs/hpc-hub/saved/${b:-detached}"; '
              'if [ "$setting" = off ]; then echo off; exit 0; fi; '
              'last=$(git rev-parse -q --verify "$ref"); '
              f'if [ -n "$last" ] && [ {int(not force)} = 1 ] && '
              f'[ $(( {now} - $(git log -1 --format=%ct "$last") )) -lt {GAP} ]; then echo soon; exit 0; fi; '
              'if [ -n "$last" ] && [ "$(git rev-parse "$last^{tree}")" = "$tree" ]; '
              'then echo same "$last"; exit 0; fi; '
              'base=$(git rev-parse -q --verify "$last^2" || git rev-parse -q --verify "$last^1"); '
              'if [ -z "$last" ] || [ "$base" != "$head" ]; '
              f'then if [ -n "$head" ] && [ "$(git rev-parse "$head^{{tree}}")" = "$tree" ] && [ {int(force)} = 0 ]; '
              'then echo clean; exit 0; fi; fi; '
              f"{IDENTITY}; "
              'files=$(git diff --name-only "${last:-${head:-' + "4b825dc642cb6eb9a060e54bf8d69288fbee4904" +
              '}}" "$tree" | head -n 20 | tr "\\n" " "); '
              'c=$(git commit-tree "$tree" ${last:+-p "$last"} ${head:+-p "$head"} -m ' + shlex.quote(kind) +
              ' -m "files: $files") && git update-ref -m ' + shlex.quote(kind) + ' "$ref" "$c" && echo "saved $c" && '
              'if [ "$setting" = backup ] && git remote | grep -qx origin; then '
              '(timeout 60 git push -q -f origin "$ref:refs/heads/saved/$(id -un)/${b:-detached}" >/dev/null 2>&1 &); '
              'fi')
    out = run(ssh, script).split()
    if out and out[0] == "saved":
        return {"saved": out[1], "why": ""}
    return {"saved": "", "why": out[0] if out else "", "last": out[1] if len(out) > 1 else ""}


VERSION_FMT = "%x1e%H%x1f%ct%x1f%P%x1f%s%x1f%b"


def versions(ssh: SshMaster, folder: str, branch: str = "") -> list[dict]:
    """The saved versions of a branch (yours now if ""), newest first: {hash, time, kind, files, base (the commit
    you were on), previous}."""
    G = g(folder)
    b = branch or run(ssh, f"{G} branch --show-current").strip()
    res = ssh.run(f"{G} log --first-parent -n 400 --format={shlex.quote(VERSION_FMT)} {_ref(b)} --", timeout=60)
    if res.returncode != 0:
        return []
    out = []
    for rec in res.stdout.split("\x1e")[1:]:
        f = rec.split("\x1f")
        if len(f) < 5:
            continue
        ps = f[2].split()
        files = next((x[7:].split() for x in f[4].splitlines() if x.startswith("files: ")), [])
        out.append({"hash": f[0], "time": int(f[1] or 0), "kind": f[3], "files": files,
                    "previous": ps[0] if len(ps) == 2 else "", "base": ps[-1] if ps else ""})
        if len(ps) < 2:  # the first one: its only parent is the commit it was made on
            break
    return out


def prune(ssh: SshMaster, folder: str, days: int = KEEP_DAYS, branch: str = "") -> int:
    """Clear versions older than `days`: the chain is made again from the oldest one kept, with the same dates.
    Returns how many were cleared."""
    G = g(folder)
    b = branch or run(ssh, f"{G} branch --show-current").strip()
    found = versions(ssh, folder, b)
    cut = time.time() - days * 86400
    keep = [v for v in found if v["time"] >= cut]
    if len(keep) == len(found):
        return 0
    ref = _ref(b)
    if not keep:
        run(ssh, f"{G} update-ref -d {ref}")
        return len(found)
    lines = [f"cd {shlex.quote(folder)}", f"export {ENV}", IDENTITY, 'prev=""']
    for v in reversed(keep):
        date = f"@{v['time']} +0000"
        lines.append(f"msg=$(git log -1 --format=%B {v['hash']}) && t=$(git rev-parse {v['hash']}^{{tree}}) && "
                     f"prev=$(GIT_AUTHOR_DATE={shlex.quote(date)} GIT_COMMITTER_DATE={shlex.quote(date)} "
                     f"git commit-tree \"$t\" ${{prev:+-p \"$prev\"}} {('-p ' + v['base']) if v['base'] else ''} "
                     f"-m \"$msg\") || exit 1")
    lines.append(f"git update-ref -m prune {ref} \"$prev\"")
    run(ssh, " && ".join(lines[:3]) + "; " + "; ".join(lines[3:]))
    return len(found) - len(keep)


def setting(ssh: SshMaster, folder: str, mode: str) -> str:
    if mode not in SETTINGS:
        raise ValueError(f"No setting {mode}")
    run(ssh, f"{g(folder)} config hpc-hub.saved {mode}")
    if mode == "backup":
        save(ssh, folder, "Saved", force=True)
    return mode


def restore(ssh: SshMaster, folder: str, version: str) -> dict:
    """Make the files what they were in a saved version (or any commit). What you have now is saved first, as a
    version, so you can come back to it. Nothing is committed and the index stays as it is."""
    now = save(ssh, folder, "Before restoring", force=True)
    before = now["saved"] or now.get("last") or snapshot(ssh, folder, "Before restoring")["commit"]
    G = g(folder)
    q = shlex.quote(rev(version))
    run(ssh, f"cd {shlex.quote(folder)} && top=$(git rev-parse --show-toplevel) && "
             f"{G} diff --binary --no-color {before} {q} -- . {SKIP} | (cd \"$top\" && {ENV} git apply --binary -)")
    return {"before": before}


def put_back(ssh: SshMaster, path: str, line: int, expect: list[str], lines: list[str]) -> None:
    """Replace lines [line, line + len(expect)) of a file with `lines`, if they still read `expect`."""
    from ..files import remote_fs
    text = remote_fs.read_bytes(ssh, path).decode("utf-8", "replace")
    rows = text.split("\n")
    at = max(0, int(line) - 1)
    if rows[at:at + len(expect)] != list(expect):
        raise GitError("The file changed there since. Open it in the Editor to change it by hand.")
    rows[at:at + len(expect)] = list(lines)
    remote_fs.write_bytes(ssh, path, "\n".join(rows).encode())


# -- automatic versions on save and compile ---------------------------------------------------------------------------
_last: dict[tuple[int, str], float] = {}
_pruned: dict[tuple[int, str], float] = {}
_lock = threading.Lock()


def auto(ssh: SshMaster, path: str, kind: str) -> None:
    """After a save or a compile: keep a version in the background, at most every 5 minutes per folder. Quiet
    about everything (not a repository, no git, off)."""
    folder = posixpath.dirname(path) if posixpath.splitext(path)[1] else path
    key = (id(ssh), folder)
    with _lock:
        if time.monotonic() - _last.get(key, -GAP) < GAP:
            return
        _last[key] = time.monotonic()

    def work():
        try:
            G = g(folder)
            res = ssh.run(f"{G} rev-parse --show-toplevel && {G} rev-parse -q --verify HEAD", timeout=30)
            root = res.stdout.split("\n")[0].strip()
            if res.returncode != 0 or not root:
                return
            top = (id(ssh), root)
            with _lock:
                if top != key and time.monotonic() - _last.get(top, -GAP) < GAP:
                    return
                _last[top] = time.monotonic()
            save(ssh, root, kind)
            if time.monotonic() - _pruned.get(top, -86400) >= 86400:
                _pruned[top] = time.monotonic()
                prune(ssh, root)
        except Exception:  # noqa: BLE001 (a version is a bonus, never an error to show)
            pass
    threading.Thread(target=work, daemon=True, name="saved-version").start()


