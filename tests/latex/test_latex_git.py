import subprocess

from hpc_hub.core.config import LatexSettings
from hpc_hub.latex import build as latex
from hpc_hub.latex import git, pdfdiff
from tests.helpers import LocalShell

LOG = """./main.tex:12: Undefined control sequence.
l.12 \\foo
./chapters/intro.tex:3: Missing $ inserted.
./main.tex:12: Undefined control sequence.
"""


def test_build_script():
    cmd = latex.build_script("/home/u/paper/main.tex", LatexSettings(setup="module load TeXLive"))
    assert cmd.startswith("bash -lc")  # module needs a login shell
    assert "module load TeXLive && cd /home/u/paper && if command -v latexmk" in cmd and "latexmk -pdf " in cmd
    plain = latex.build_script("/p/main.tex", LatexSettings())
    assert plain.startswith("cd /p && if command -v latexmk") and "\\\\citation" in plain
    assert latex.pdf_path("/p/main.tex") == "/p/main.pdf"


def test_parse_issues():
    issues = latex.parse_issues(LOG)
    assert [(i.file, i.line) for i in issues] == [("main.tex", 12), ("intro.tex", 3)]


def test_git_on_local_repo(tmp_path):
    sh, repo = LocalShell(), tmp_path / "paper"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", "git@github.com:me/paper.git"], check=True)
    (repo / "main.tex").write_text("x")
    env_cfg = "-c user.name=T -c user.email=t@x"
    sh.run(f"git -C {repo} {env_cfg} add -A && git -C {repo} {env_cfg} commit -qm 'first'")
    (repo / "main.tex").write_text("y")
    i = git.info(sh, str(repo))
    assert i.root == str(repo) and i.branch == "main"
    assert i.remotes == {"origin": "git@github.com:me/paper.git"}
    assert i.changes == [" M main.tex"] and i.history[0].subject == "first"
    assert "first" in git.show(sh, str(repo), i.history[0].hash)
    assert git.info(sh, str(tmp_path)).root == ""
    (repo / "main.aux").write_text("junk")
    sh.run(f"git -C {repo} config user.name T && git -C {repo} config user.email t@x")
    git.commit_all(sh, str(repo), "second")
    after = git.info(sh, str(repo))
    assert after.history[0].subject == "second" and after.changes == ["?? main.aux"]


def test_info_on_a_repository_without_commits(tmp_path):
    import subprocess

    from hpc_hub.latex import git
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "main.tex").write_text("x")
    i = git.info(LocalShell(), str(tmp_path))
    assert i.root == str(tmp_path) and i.history == [] and any("main.tex" in c for c in i.changes)


def test_a_failed_version_pdf_is_explained():
    assert "latexdiff is not on Wulver" in pdfdiff.explain(pdfdiff.NO_LATEXDIFF, "", "Wulver", True)
    assert pdfdiff.explain(1, LOG, "Wulver", False) == (
        "That version did not compile. First error: main.tex line 12, Undefined control sequence.")
    assert pdfdiff.explain(1, "", "Wulver", True).startswith("The red and blue version did not compile.")


def test_setup_runs_in_a_login_shell_only_when_there_is_one():
    assert latex.with_setup("make", "  ") == "make"
    assert latex.with_setup("make", "module load texlive") == "bash -lc 'module load texlive && make'"
