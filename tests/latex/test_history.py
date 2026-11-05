"""The History tab's git, run for real against small repositories in a temporary folder (LocalShell stands in for
the cluster). jdoe and asmith are made up."""

import os
import subprocess
import time

import pytest

from hpc_hub.latex import branches, history, pdfdiff, saved, sync
from hpc_hub.latex.git import GitError
from tests.helpers import LocalShell

SKETCH = """\\section{Sketch}
Then, writing $W$,
\\begin{equation}
\\mathbb{E}Z^4\\le 3K_p(p!)^2W^2.
\\end{equation}
by the scalar Rademacher fourth-moment bound.
Determinant moments and Cauchy-Schwarz then prove it.
"""
APPENDIX = """\\section{Appendix}
\\begin{proof}
To see this, condition on all labels and write the sum.
Independent sign moments give the second moment bound.
and the fourth moment is at most nine times the square.
by the scalar Rademacher fourth-moment bound once more.
Determinant moments and Cauchy-Schwarz then prove the lemma.
\\end{proof}
"""


def git(repo, *args, env=None, check=True):
    e = {**os.environ, "GIT_AUTHOR_NAME": "jdoe", "GIT_AUTHOR_EMAIL": "jdoe@example.edu",
         "GIT_COMMITTER_NAME": "jdoe", "GIT_COMMITTER_EMAIL": "jdoe@example.edu", **(env or {})}
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, env=e, check=check).stdout


def commit(repo, message, who="jdoe", when=None):
    env = {"GIT_AUTHOR_NAME": who, "GIT_AUTHOR_EMAIL": f"{who}@example.edu", "GIT_COMMITTER_NAME": who,
           "GIT_COMMITTER_EMAIL": f"{who}@example.edu"}
    if when:
        env |= {"GIT_AUTHOR_DATE": f"@{when} +0000", "GIT_COMMITTER_DATE": f"@{when} +0000"}
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", message, env=env)
    return git(repo, "rev-parse", "HEAD").strip()


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "paper"
    (r / "sections").mkdir(parents=True)
    git(tmp_path, "init", "-q", "-b", "main", str(r))
    git(r, "config", "user.name", "jdoe")
    git(r, "config", "user.email", "jdoe@example.edu")
    (r / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\n\\input{sections/sketch}\n"
                                "\\input{sections/appendix}\n\\end{document}\n")
    (r / "sections/sketch.tex").write_text(SKETCH)
    (r / "sections/appendix.tex").write_text(APPENDIX)
    commit(r, "First draft", when=int(time.time()) - 86400 * 3)
    return r


@pytest.fixture
def sh():
    return LocalShell()


def test_log_has_counts_and_tags(repo, sh):
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p"))
    commit(repo, "Fix fourth-moment constant: 9, not 3\n\nThe bound is applied twice.", who="asmith")
    git(repo, "tag", "v1-arxiv")
    found = history.log(sh, str(repo))
    assert [c["subject"] for c in found] == ["Fix fourth-moment constant: 9, not 3", "First draft"]
    top = found[0]
    assert top["author"] == "asmith" and top["body"] == "The bound is applied twice."
    assert top["tags"] == ["v1-arxiv"] and "main" in top["branches"]
    assert top["files"] == [{"path": "sections/sketch.tex", "added": 1, "removed": 1, "binary": False}]
    assert found[1]["added"] == 20 and len(found[1]["files"]) == 3


def test_a_commit_marks_the_changed_words(repo, sh):
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p").replace(
        "by the scalar", "by applying the scalar"))
    h = commit(repo, "Fix the constant")
    c = history.changes(sh, str(repo), "", h)
    [f] = c["files"]
    assert f["path"] == "sections/sketch.tex" and (f["added"], f["removed"]) == (2, 2)
    rows = [r for hk in f["hunks"] for r in hk["rows"] if r["k"] != " "]
    old = next(r for r in rows if r["k"] == "-" and "3K" in r["t"])
    new = next(r for r in rows if r["k"] == "+" and "9K" in r["t"])
    assert [old["t"][a:b] for a, b in old["m"]] == ["3"] and [new["t"][a:b] for a, b in new["m"]] == ["9"]
    applying = next(r for r in rows if r["k"] == "+" and "applying" in r["t"])
    assert [applying["t"][a:b] for a, b in applying["m"]] == ["applying"]
    assert old["o"] == 4 and new["n"] == 4


def test_text_that_moved_is_one_move_with_its_real_change(repo, sh):
    moved = APPENDIX.split("\n")[2:7]
    (repo / "sections/appendix.tex").write_text("\n".join(APPENDIX.split("\n")[:2] + APPENDIX.split("\n")[7:]))
    edited = moved[:-1] + ["Determinant moments and Cauchy-Schwarz then prove \\eqref{eq:m}."]
    (repo / "sections/sketch.tex").write_text(SKETCH + "\n".join(edited) + "\n")
    h = commit(repo, "Move the proof up from the appendix")
    c = history.changes(sh, str(repo), "", h)
    [m] = c["moves"]
    assert m["from"] == {"path": "sections/appendix.tex", "line": 3, "end": 7}
    assert m["to"]["path"] == "sections/sketch.tex" and m["changes"] == 1 and m["lines"] == 5
    rows = [r for f in c["files"] if f["path"] == "sections/sketch.tex" for hk in f["hunks"] for r in hk["rows"]]
    same = [r for r in rows if r.get("same")]
    assert len(same) == 4 and all(r["o"] and r["n"] for r in same)  # both line numbers, like 88 and 25
    src = [r for r in rows if r.get("src")]
    assert len(src) == 1 and "the lemma" in src[0]["t"] and src[0]["m"]
    gone = [r for f in c["files"] if f["path"] == "sections/appendix.tex" for hk in f["hunks"] for r in hk["rows"]
            if r.get("mv")]
    assert len(gone) == 5


def test_changes_now_include_new_files_but_not_build_files(tmp_path, sh):
    top = tmp_path / "thesis"
    (top / "paper").mkdir(parents=True)
    git(tmp_path, "init", "-q", "-b", "main", str(top))
    (top / "paper/main.tex").write_text("a\nb\n")
    commit(top, "start")
    (top / "paper/main.tex").write_text("a\nc\n")
    (top / "paper/refs.bib").write_text("@misc{x,\n}\n")
    (top / "paper/main.aux").write_text("junk")
    c = history.changes(sh, str(top / "paper"))
    by = {f["path"]: f for f in c["files"]}
    assert set(by) == {"paper/main.tex", "paper/refs.bib"}
    assert by["paper/refs.bib"]["status"] == "A" and by["paper/refs.bib"]["added"] == 2
    st = history.state(sh, str(top / "paper"))
    assert st["prefix"] == "paper/" and st["branch"] == "main" and st["saved"] == "cluster"
    assert {c["path"]: c["new"] for c in st["changes"]} == {"paper/main.tex": False, "paper/refs.bib": True}
    assert history.state(sh, str(tmp_path))["root"] == ""


def test_who_changed_a_line_and_the_change_before(repo, sh):
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "5K_p"))
    first = commit(repo, "Five", who="jdoe")
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p"))
    second = commit(repo, "Fix fourth-moment constant: 9, not 3", who="asmith")
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p") + "Not committed.\n")
    b = history.blame(sh, str(repo), str(repo / "sections/sketch.tex"))
    assert len(b["lines"]) == 8
    assert b["commits"][b["lines"][3][0]]["author"] == "asmith"
    assert b["commits"][b["lines"][7][0]]["uncommitted"]
    story = history.line_story(sh, str(repo), str(repo / "sections/sketch.tex"), 4)
    assert story["commit"]["hash"] == second and story["commit"]["subject"].startswith("Fix")
    assert [r["k"] for r in story["rows"]] == ["-", "+"] and "5K" in story["rows"][0]["t"]
    assert story["older"]["hash"] == first and story["older"]["subject"] == "Five"
    back = history.line_story(sh, str(repo), story["older"]["path"], story["older"]["line"], story["older"]["rev"])
    assert back["commit"]["hash"] == first
    assert history.line_story(sh, str(repo), str(repo / "sections/sketch.tex"), 8)["uncommitted"]


def test_refs_for_the_pickers(repo, sh, tmp_path):
    origin = tmp_path / "origin.git"
    git(tmp_path, "clone", "-q", "--bare", str(repo), str(origin))
    git(repo, "remote", "add", "origin", str(origin))
    git(repo, "fetch", "-q", "origin")
    git(repo, "branch", "-q", "--set-upstream-to=origin/main")
    git(repo, "tag", "v1-arxiv")
    git(repo, "checkout", "-q", "-b", "reviewer-2")
    (repo / "reply.tex").write_text("Thanks.\n")
    commit(repo, "Answer reviewer 2")
    git(repo, "push", "-q", "origin", "reviewer-2:asmith/tighter-bound")
    git(repo, "checkout", "-q", "main")
    git(repo, "pull", "-q", "--ff-only")
    r = history.refs(sh, str(repo))
    assert r["current"] == "main"
    by = {b["name"]: b for b in r["branches"]}
    assert by["reviewer-2"]["new"] == 1 and by["main"]["upstream"] == "origin/main"
    assert [x["local"] for x in r["remote_only"]] == ["asmith/tighter-bound"]
    assert [t["name"] for t in r["tags"]] == ["v1-arxiv"]
    assert r["mine"]["subject"] == "First draft"  # on this branch
    lanes = history.lanes(sh, str(repo), "main", "reviewer-2")
    assert lanes["only_a"] == [] and [c["subject"] for c in lanes["only_b"]] == ["Answer reviewer 2"]
    assert history.file_at(sh, str(repo), "reviewer-2", "reply.tex") == "Thanks.\n"
    with pytest.raises(GitError):
        history.rev("main;rm -rf /")


def test_saved_versions_leave_index_and_files_alone(repo, sh):
    (repo / "notes.tex").write_text("staged\n")
    git(repo, "add", "notes.tex")
    (repo / "sections/sketch.tex").write_text(SKETCH + "one\n")
    (repo / "new.tex").write_text("new\n")
    (repo / "main.aux").write_text("build")
    index = git(repo, "diff", "--cached", "--name-only")
    first = saved.save(sh, str(repo), "Saved")
    assert first["saved"] and git(repo, "diff", "--cached", "--name-only") == index
    assert git(repo, "status", "--porcelain").count("\n") == 4
    tree = git(repo, "ls-tree", "-r", "--name-only", first["saved"]).split()
    assert "new.tex" in tree and "notes.tex" in tree and "main.aux" not in tree
    assert saved.save(sh, str(repo), "Saved")["why"] == "soon"
    assert saved.save(sh, str(repo), "Saved", force=True)["why"] == "same"
    (repo / "sections/sketch.tex").write_text(SKETCH + "two\n")
    second = saved.save(sh, str(repo), "Compiled", force=True)["saved"]
    v = saved.versions(sh, str(repo))
    assert [x["hash"] for x in v] == [second, first["saved"]] and v[0]["kind"] == "Compiled"
    assert v[0]["files"] == ["sections/sketch.tex"] and v[0]["base"] == git(repo, "rev-parse", "HEAD").strip()
    assert "hpc-hub" not in git(repo, "branch", "-a")
    assert saved.restore(sh, str(repo), first["saved"])["before"] == second  # what you had is kept already
    assert (repo / "sections/sketch.tex").read_text() == SKETCH + "one\n"
    (repo / "sections/sketch.tex").write_text(SKETCH + "three\n")
    saved.restore(sh, str(repo), first["saved"])
    assert saved.versions(sh, str(repo))[0]["kind"] == "Before restoring"
    saved.put_back(sh, str(repo / "sections/sketch.tex"), 8, ["one"], ["one", "and back"])
    assert (repo / "sections/sketch.tex").read_text().endswith("one\nand back\n")
    with pytest.raises(GitError):
        saved.put_back(sh, str(repo / "sections/sketch.tex"), 1, ["nope"], [])
    saved.setting(sh, str(repo), "off")
    assert saved.save(sh, str(repo), "Saved", force=True)["why"] == "off"


def test_old_versions_are_cleared(repo, sh):
    old = int(time.time()) - 40 * 86400
    (repo / "a.tex").write_text("a\n")
    env = {"GIT_COMMITTER_DATE": f"@{old} +0000"}
    first = saved.save(sh, str(repo), "Saved")["saved"]
    c = git(repo, "commit-tree", f"{first}^{{tree}}", "-p", first, "-p", "HEAD", "-m", "Saved", env=env).strip()
    git(repo, "update-ref", "refs/hpc-hub/saved/main", c)  # an old one on top: the chain is made again without it
    (repo / "a.tex").write_text("b\n")
    git(repo, "update-ref", "refs/hpc-hub/saved/main",
        git(repo, "commit-tree", f"{first}^{{tree}}", "-p", c, "-p", "HEAD", "-m", "Saved").strip())
    assert len(saved.versions(sh, str(repo))) == 3
    assert saved.prune(sh, str(repo)) == 1
    assert len(saved.versions(sh, str(repo))) == 2


def _two_branches(repo):
    git(repo, "checkout", "-q", "-b", "reviewer-2")
    (repo / "sections/appendix.tex").write_text(APPENDIX.replace("once more", "twice"))
    commit(repo, "Answer reviewer 2")
    git(repo, "checkout", "-q", "main")


def test_switch_brings_changes_along_when_they_do_not_clash(repo, sh):
    _two_branches(repo)
    (repo / "sections/sketch.tex").write_text(SKETCH + "mine\n")
    c = branches.check(sh, str(repo), "reviewer-2")
    assert c["bring"] and c["files"] == 1 and c["changes"][0]["path"] == "sections/sketch.tex"
    steps = []
    r = branches.switch(sh, str(repo), "reviewer-2", "bring", steps.append)
    assert r["branch"] == "reviewer-2" and r["brought"] == 1
    assert git(repo, "branch", "--show-current").strip() == "reviewer-2"
    assert (repo / "sections/sketch.tex").read_text().endswith("mine\n")
    assert steps[0].startswith("Made a safe copy") and steps[-1].startswith("Updating 1 file")


def test_a_clash_is_found_and_keep_gives_them_back_on_return(repo, sh):
    _two_branches(repo)
    (repo / "sections/appendix.tex").write_text(APPENDIX.replace("once more", "three times"))
    c = branches.check(sh, str(repo), "reviewer-2")
    assert not c["bring"] and c["clash"] == [{"path": "sections/appendix.tex", "line": 6}]
    with pytest.raises(GitError):
        branches.switch(sh, str(repo), "reviewer-2", "bring", lambda s: None)
    r = branches.switch(sh, str(repo), "reviewer-2", "keep", lambda s: None)
    assert r["kept"] == 1 and "twice" in (repo / "sections/appendix.tex").read_text()
    assert git(repo, "status", "--porcelain") == ""
    back = branches.switch(sh, str(repo), "main", "bring", lambda s: None)
    assert back["back"] == "back" and "three times" in (repo / "sections/appendix.tex").read_text()


def test_changes_to_the_same_file_can_still_come_along(repo, sh):
    _two_branches(repo)
    (repo / "sections/appendix.tex").write_text(APPENDIX.replace("\\section{Appendix}", "\\section{More}"))
    c = branches.check(sh, str(repo), "reviewer-2")
    assert c["bring"]  # same file, different lines: git merges them
    branches.switch(sh, str(repo), "reviewer-2", "bring", lambda s: None)
    text = (repo / "sections/appendix.tex").read_text()
    assert "\\section{More}" in text and "twice" in text


def test_new_branch(repo, sh):
    (repo / "x.tex").write_text("x\n")
    assert branches.new_branch(sh, str(repo), "camera-ready") == "camera-ready"
    assert git(repo, "branch", "--show-current").strip() == "camera-ready" and (repo / "x.tex").exists()
    with pytest.raises(GitError):
        branches.new_branch(sh, str(repo), "bad name")


@pytest.fixture
def shared(repo, tmp_path):
    """repo pushes to origin.git; co is asmith's clone."""
    origin = tmp_path / "origin.git"
    git(tmp_path, "clone", "-q", "--bare", str(repo), str(origin))
    git(repo, "remote", "add", "origin", str(origin))
    git(repo, "fetch", "-q", "origin")
    git(repo, "branch", "-q", "--set-upstream-to=origin/main")
    co = tmp_path / "co"
    git(tmp_path, "clone", "-q", str(origin), str(co))
    return origin, co


def test_safe_push_pulls_first_and_brings_changes_back(repo, sh, shared):
    origin, co = shared
    (co / "sections/appendix.tex").write_text(APPENDIX.replace("\\section{Appendix}", "\\section{Proofs}"))
    commit(co, "Rename the appendix", who="asmith")
    git(co, "push", "-q")
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p"))
    commit(repo, "Fix the constant")
    (repo / "main.tex").write_text((repo / "main.tex").read_text() + "% a note\n")
    (repo / "draft.tex").write_text("new file\n")
    steps = []
    end = sync.start(sh, str(repo), True, steps.append)
    assert end["done"] and end["pulled"] == 1 and end["pulled_by"] == "asmith" and end["pushed"] == 1
    assert end["back"] == 1
    assert git(origin, "log", "-1", "--format=%s", "main").strip() == "Fix the constant"
    assert git(repo, "log", "-2", "--format=%s").split("\n")[:2] == ["Fix the constant", "Rename the appendix"]
    assert (repo / "main.tex").read_text().endswith("% a note\n") and (repo / "draft.tex").exists()
    assert steps[0].startswith("Put your 1 change") and steps[-1] == "Bring your changes back"
    assert sync.load(sh, str(repo)) is None
    assert history.refs(sh, str(repo))["last_pull"]


def test_a_spot_to_settle_stops_before_the_push(repo, sh, shared):
    origin, co = shared
    (co / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "8K_p"))
    commit(co, "Tighten the constant", who="asmith")
    git(co, "push", "-q")
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p"))
    commit(repo, "Fix the constant")
    (repo / "main.tex").write_text((repo / "main.tex").read_text() + "% mine\n")
    paused = sync.start(sh, str(repo), True, lambda s: None)
    assert paused["stage"] == "pull" and len(paused["spots"]) == 1
    spot = paused["spots"][0]
    assert spot["path"] == "sections/sketch.tex" and "9K" in spot["mine"][0] and "8K" in spot["theirs"][0]
    assert spot["theirs_commit"]["author"] == "asmith" and spot["mine_commit"]["subject"] == "Fix the constant"
    assert git(origin, "log", "-1", "--format=%s", "main").strip() == "Tighten the constant"  # nothing sent
    after = sync.settle(sh, str(repo), "sections/sketch.tex", [{"take": "mine"}])
    assert after["spots"] == []
    end = sync.go_on(sh, str(repo), lambda s: None)
    assert end["done"] and end["pushed"] == 1
    assert "9K_p" in git(origin, "show", "main:sections/sketch.tex")
    assert (repo / "main.tex").read_text().endswith("% mine\n")


def test_stop_puts_everything_back(repo, sh, shared):
    origin, co = shared
    (co / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "8K_p"))
    commit(co, "Tighten", who="asmith")
    git(co, "push", "-q")
    (repo / "sections/sketch.tex").write_text(SKETCH.replace("3K_p", "9K_p"))
    mine = commit(repo, "Fix")
    (repo / "main.tex").write_text((repo / "main.tex").read_text() + "% mine\n")
    sync.start(sh, str(repo), True, lambda s: None)
    sync.stop(sh, str(repo))
    assert git(repo, "rev-parse", "HEAD").strip() == mine
    assert (repo / "main.tex").read_text().endswith("% mine\n") and sync.load(sh, str(repo)) is None
    assert git(repo, "status", "--porcelain").strip() == "M main.tex"


def test_resolve_picks():
    text = "a\n<<<<<<< HEAD\ntheirs\n||||||| base\nold\n=======\nmine\n>>>>>>> c1\nz"
    [b] = sync.blocks(text)
    assert (b["theirs"], b["base"], b["mine"], b["line"]) == (["theirs"], ["old"], ["mine"], 2)
    assert sync.resolve(text, [{"take": "both"}]) == "a\nmine\ntheirs\nz"
    assert sync.resolve(text, [{"take": "edit", "text": "new"}]) == "a\nnew\nz"


def test_an_old_version_builds_in_a_worktree_and_latexdiff_missing_is_explained(repo, sh, tmp_path):
    from hpc_hub.core.config import LatexSettings
    (repo / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n")
    h = commit(repo, "Plain")
    p = pdfdiff.plan(sh, str(repo), str(repo / "main.tex"), h, None, LatexSettings())
    assert not p["cached"] and p["pdf"].endswith(".pdf")
    res = sh.run(p["script"], timeout=120)
    if res.returncode == 0:  # pdflatex here: the PDF is kept and the worktree gone
        assert os.path.getsize(p["pdf"]) > 0
        assert pdfdiff.plan(sh, str(repo), str(repo / "main.tex"), h, None, LatexSettings())["cached"]
    assert "hpc-hub/wt-" not in git(repo, "worktree", "list")
    d = pdfdiff.plan(sh, str(repo), str(repo / "main.tex"), "", "HEAD~1", LatexSettings())
    res = sh.run(d["script"].replace("command -v latexdiff", "command -v latexdiff-not-here"))
    assert res.returncode == pdfdiff.NO_LATEXDIFF
    assert "latexdiff is not on Wulver" in pdfdiff.explain(res.returncode, res.stdout, "Wulver", True)
    assert git(repo, "worktree", "list").count("\n") == 1
