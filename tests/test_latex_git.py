import subprocess

from hpc_hub import git, latex
from hpc_hub.config import LatexSettings
from tests.test_remote_fs import LocalShell

LOG = """./main.tex:12: Undefined control sequence.
l.12 \\foo
./chapters/intro.tex:3: Missing $ inserted.
./main.tex:12: Undefined control sequence.
"""


def test_build_command():
    s = LatexSettings(setup="module load TeXLive")
    cmd = latex.build_command("/home/u/paper/main.tex", s, job_id="42")
    assert cmd.startswith("srun --jobid=42 --overlap bash -lc")
    assert "module load TeXLive && if command -v latexmk" in cmd and "latexmk -pdf " in cmd
    assert latex.build_command("/p/main.tex", LatexSettings(on_node=False), "42").startswith("bash -lc")
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
