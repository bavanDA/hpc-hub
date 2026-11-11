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
