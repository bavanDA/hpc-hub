import subprocess

from hpc_hub.projects import store as projects
from hpc_hub.projects.store import Project


def test_round_trip(tmp_path):
    path = tmp_path / "p.toml"
    assert projects.load(path) == []
    items = [Project("myproj", "wulver", "/scratch/mygroup/jdoe/myproj", opened=5),
             Project('my "mc"', "yale", "/nfs/x/thesis", main_tex="paper/main.tex")]
    projects.save(items, path)
    assert projects.load(path) == items


def test_create_latex_project(tmp_path):
    folder = tmp_path / "work" / "paper"
    cmd = projects.create_command(str(folder), "LaTeX paper", "My 'paper'", git_init=False)
    subprocess.run(["bash", "-c", cmd], check=True)
    main = (folder / "main.tex").read_text()
    assert "\\title{My 'paper'}" in main and "\\documentclass{article}" in main
    assert "*.aux" in (folder / ".gitignore").read_text()
    assert subprocess.run(["bash", "-c", cmd]).returncode != 0  # never overwrites


def test_create_python_project(tmp_path):
    folder = tmp_path / "py"
    subprocess.run(["bash", "-c", projects.create_command(str(folder), "Python", "x", git_init=False)], check=True)
    assert (folder / "main.py").exists() and (folder / "README.md").read_text() == "# x\n"


class LocalSsh:
    def run(self, cmd, timeout=60):
        return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)


def test_find_main_tex(tmp_path):
    (tmp_path / "sec").mkdir()
    (tmp_path / "sec" / "intro.tex").write_text("\\section{Intro}\n")
    (tmp_path / "sec" / "draft.tex").write_text("\\documentclass{article}\n")
    (tmp_path / "main.tex").write_text("% comment\n\\documentclass{article}\n")
    (tmp_path / "old.tex").write_text("% \\documentclass{article}\n")
    assert projects.find_main_tex(LocalSsh(), str(tmp_path)) == ["main.tex", "sec/draft.tex"]


def test_store(tmp_path):
    path = tmp_path / "p.toml"
    store = projects.ProjectStore(path)
    calls = []
    store.listeners.append(lambda: calls.append(1))
    a, b = Project("a", "wulver", "/a"), Project("b", "yale", "/b")
    store.add(a)
    store.add(b)
    store.touch(a)
    assert [p.name for p in store.recent()] == ["a", "b"] and len(calls) == 3
    store.remove(b)
    assert projects.ProjectStore(path).items == [a]


def test_parse_papers():
    text = ("1700000300|/s/thesis/paper/main.tex\n1700000400|/s/thesis/paper/draft.tex\n"
            "1700000100|/home/me/old/thesis.tex\nnoise\n")
    a, b = projects.parse_papers(text)
    assert (a.folder, a.main, a.mtime, a.others) == ("/s/thesis/paper", "main.tex", 1700000400, 1)
    assert (b.folder, b.main, b.others) == ("/home/me/old", "thesis.tex", 0)


def test_is_latex():
    assert Project("p", "w", "/x", "main.tex").is_latex
    assert not Project("mc", "w", "/x", "papers/final/main.tex").is_latex  # a repo with a paper inside
    assert not Project("k", "w", "/x").is_latex
    assert Project("p", "w", "/x", kind="latex").is_latex
    assert not Project("c", "w", "/x", "main.tex", kind="code").is_latex


def test_papers_are_remembered(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
    assert projects.load_papers("wulver") == ([], 0)
    found = [projects.Paper("/s/thesis/paper", "main.tex", 1700000400, 1)]
    projects.save_papers("wulver", found)
    papers, at = projects.load_papers("wulver")
    assert papers == found and at > 0
