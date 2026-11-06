"""PDFs of other versions, built on demand: the paper as it was at a commit (for Side by side), and latexdiff's
red and blue between two versions. Each is built in a temporary worktree under the repository's .git (so your files
are never touched), with the same latexmk build as Recompile, and kept in <git dir>/hpc-hub/pdf/ by the versions'
trees: asking again is instant."""

import posixpath
import shlex

from ..core.config import LatexSettings
from ..core.ssh import SshMaster
from . import build as latex
from . import saved
from .git import ENV
from .history import SEP, g, parts, rev, run

NO_LATEXDIFF = 7  # the script's exit code when latexdiff is missing


def where(ssh: SshMaster, folder: str, main: str) -> dict:
    """The repository's top, its git dir, and main as a path from the top."""
    p = parts(run(ssh, f"{g(folder)} rev-parse --show-toplevel; echo {SEP}; {g(folder)} rev-parse --absolute-git-dir; "
                       f"echo {SEP}; cd {shlex.quote(posixpath.dirname(main))} && {ENV} git rev-parse --show-prefix"),
              3)
    return {"root": p[0].strip(), "git_dir": p[1].strip(), "main": p[2].strip() + posixpath.basename(main)}


def tree_of(ssh: SshMaster, folder: str, version: str) -> tuple[str, str]:
    """(commit, tree) of a version; "" is the files now (kept as a commit on no ref, so a worktree can hold it)."""
    if not version:
        s = saved.snapshot(ssh, folder, "Files now, for a PDF")
        return s["commit"], s["tree"]
    out = run(ssh, f"{g(folder)} rev-parse {shlex.quote(rev(version))} {shlex.quote(rev(version))}^{{tree}}").split()
    return out[0], out[1]


def plan(ssh: SshMaster, folder: str, main: str, version: str, against: str | None, s: LatexSettings) -> dict:
    """What to build: {pdf (where it is kept), cached, script}. against None: version's own PDF; otherwise
    latexdiff from `against` to `version` ("" = the files now)."""
    w = where(ssh, folder, main)
    cache = posixpath.join(w["git_dir"], "hpc-hub", "pdf")
    new_commit, new_tree = tree_of(ssh, folder, version)
    old_commit, old_tree = tree_of(ssh, folder, against) if against is not None else ("", "")
    key = f"diff-{old_tree[:12]}-{new_tree[:12]}" if against is not None else new_tree[:16]
    pdf = posixpath.join(cache, key + ".pdf")
    if ssh.run(f"test -s {shlex.quote(pdf)}", timeout=30).returncode == 0:
        return {"pdf": pdf, "cached": True, "script": ""}
    root, gd = shlex.quote(w["root"]), w["git_dir"]
    new_wt, old_wt = posixpath.join(gd, "hpc-hub", f"wt-{key}"), posixpath.join(gd, "hpc-hub", f"wt-{key}-old")
    main_dir, main_name = posixpath.split(w["main"])
    plain = LatexSettings(engine=s.engine)
    if against is None:
        tex, base = main_name, posixpath.splitext(main_name)[0]
        prep = ""
    else:
        tex, base = "hpc-hub-diff.tex", "hpc-hub-diff"
        old_main, new_main = posixpath.join(old_wt, w["main"]), posixpath.join(new_wt, w["main"])
        prep = (f"{{ command -v latexdiff >/dev/null 2>&1 || exit {NO_LATEXDIFF}; }} && "
                f"git -C {root} worktree add -f --detach -q {shlex.quote(old_wt)} {old_commit} && "
                f"latexdiff --flatten {shlex.quote(old_main)} {shlex.quote(new_main)} > {tex} && ")
    build = latex.build_script(posixpath.join(new_wt, main_dir, tex), plain)  # cd there && latexmk ...
    work = posixpath.join(new_wt, main_dir)
    clean = (f"cd / ; git -C {root} worktree remove --force {shlex.quote(new_wt)} >/dev/null 2>&1; "
             f"git -C {root} worktree remove --force {shlex.quote(old_wt)} >/dev/null 2>&1; "
             f"rm -rf {shlex.quote(new_wt)} {shlex.quote(old_wt)}; git -C {root} worktree prune")
    body = (f"export {ENV}; trap {shlex.quote(clean)} EXIT; mkdir -p {shlex.quote(cache)} && "
            f"rm -rf {shlex.quote(new_wt)} {shlex.quote(old_wt)} && "
            f"git -C {root} worktree add -f --detach -q {shlex.quote(new_wt)} {new_commit} && "
            f"cd {shlex.quote(work)} && {prep}{build} && "
            f"cp {shlex.quote(posixpath.join(work, base + '.pdf'))} {shlex.quote(pdf)} && "
            f"{{ cp {shlex.quote(posixpath.join(work, base + '.synctex.gz'))} "
            f"{shlex.quote(pdf[:-4] + '.synctex.gz')} 2>/dev/null; true; }}")
    return {"pdf": pdf, "cached": False, "script": latex.with_setup(body, s.setup)}


def explain(code: int, output: str, cluster: str, diff: bool) -> str:
    """A failed build in plain words."""
    if code == NO_LATEXDIFF:
        return (f"latexdiff is not on {cluster}. Add it to the build setup (for example module load texlive) "
                "or ask your cluster's admins for it.")
    issues = latex.parse_issues(output)
    first = f" First error: {issues[0].file} line {issues[0].line}, {issues[0].message}" if issues else ""
    if diff:
        return f"The red and blue version did not compile. latexdiff sometimes trips on custom macros.{first}"
    return f"That version did not compile.{first}"

