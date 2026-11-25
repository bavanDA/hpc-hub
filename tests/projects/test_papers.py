import subprocess

from hpc_hub.projects import papers
from tests.helpers import on_linux_cluster

pytestmark = on_linux_cluster


class LocalSsh:
    def run(self, cmd, timeout=60):
        return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
    on_login = run
    read = run


def test_find_main_tex(tmp_path):
    (tmp_path / "sec").mkdir()
    (tmp_path / "sec" / "intro.tex").write_text("\\section{Intro}\n")
    (tmp_path / "sec" / "draft.tex").write_text("\\documentclass{article}\n")
    (tmp_path / "main.tex").write_text("% comment\n\\documentclass{article}\n")
    (tmp_path / "old.tex").write_text("% \\documentclass{article}\n")
    assert papers.find_main_tex(LocalSsh(), str(tmp_path)) == ["main.tex", "sec/draft.tex"]


def test_parse_papers():
    text = ("1700000300|/s/thesis/paper/main.tex\n1700000400|/s/thesis/paper/draft.tex\n"
            "1700000100|/home/jdoe/old/thesis.tex\nnoise\n")
    a, b = papers.parse_papers(text)
    assert (a.folder, a.main, a.mtime, a.others) == ("/s/thesis/paper", "main.tex", 1700000400, 1)
    assert (b.folder, b.main, b.others) == ("/home/jdoe/old", "thesis.tex", 0)


def test_papers_are_remembered(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
    assert papers.load_papers("wulver") == ([], 0)
    found = [papers.Paper("/s/thesis/paper", "main.tex", 1700000400, 1)]
    papers.save_papers("wulver", found)
    got, at = papers.load_papers("wulver")
    assert got == found and at > 0


def _paper(path, text="\\documentclass{acmart}\n"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _search(home):
    import os
    env = {k: v for k, v in os.environ.items() if k not in ("SCRATCH", "PROJECT")}
    env.update(HOME=str(home), USER="jdoe")
    out = subprocess.run(["bash", "-c", papers.PAPERS], env=env, capture_output=True, text=True, timeout=120).stdout
    return {str(p.folder).removeprefix(str(home) + "/") for p in papers.parse_papers(out)}


# 2026-11-24 report: "why the papers can't find this": a paper Claude wrote on a branch, in the project's
# .claude/worktrees/<name>/paper/conf2027, seven folders down. Hidden folders stay out, those worktrees don't.
def test_search_finds_papers_in_claude_and_codex_worktrees(tmp_path):
    _paper(tmp_path / "survey/paper/main.tex")
    _paper(tmp_path / "survey/.claude/worktrees/draft-a/paper/conf2027/main.tex")
    _paper(tmp_path / "survey/.claude/worktrees/draft-a/paper/conf2027/sections/intro.tex", "\\section{Intro}\n")
    _paper(tmp_path / "work/thesis/.codex/worktrees/a1b2/doc/main.tex")
    assert _search(tmp_path) == {"survey/paper", "survey/.claude/worktrees/draft-a/paper/conf2027",
                                 "work/thesis/.codex/worktrees/a1b2/doc"}


def test_search_still_leaves_other_hidden_folders_out(tmp_path):
    _paper(tmp_path / "survey/.git/old/main.tex")
    _paper(tmp_path / "survey/.claude/projects/x/main.tex")  # Claude's own files, not a worktree
    _paper(tmp_path / ".cache/texlive/main.tex")
    _paper(tmp_path / "survey/.claude/worktrees/w/.git/main.tex")
    _paper(tmp_path / "survey/node_modules/pkg/main.tex")
    _paper(tmp_path / "survey/.claude/worktrees/w/node_modules/pkg/main.tex")
    _paper(tmp_path / "survey/.claude/worktrees/w/notes.tex", "% \\documentclass{article}\n")
    assert _search(tmp_path) == set()


def test_search_without_worktrees_is_as_before(tmp_path):
    _paper(tmp_path / "a/b/c/d/e/main.tex")  # five folders down: found, as before
    _paper(tmp_path / "a/b/c/d/e/f/g/main.tex")  # deeper than the search goes
    (tmp_path / "survey/.claude").mkdir(parents=True)  # a .claude with no worktrees
    assert _search(tmp_path) == {"a/b/c/d/e"}
