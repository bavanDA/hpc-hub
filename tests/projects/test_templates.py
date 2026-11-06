import subprocess

from hpc_hub.projects import templates
from tests.helpers import on_linux_cluster

pytestmark = on_linux_cluster


def test_create_latex_project(tmp_path):
    folder = tmp_path / "work" / "paper"
    cmd = templates.create_command(str(folder), "LaTeX paper", "My 'paper'", git_init=False)
    subprocess.run(["bash", "-c", cmd], check=True)
    main = (folder / "main.tex").read_text()
    assert "\\title{My 'paper'}" in main and "\\documentclass{article}" in main
    assert "*.aux" in (folder / ".gitignore").read_text()
    assert subprocess.run(["bash", "-c", cmd]).returncode != 0  # never overwrites


def test_create_python_project(tmp_path):
    folder = tmp_path / "py"
    subprocess.run(["bash", "-c", templates.create_command(str(folder), "Python", "x", git_init=False)], check=True)
    assert (folder / "main.py").exists() and (folder / "README.md").read_text() == "# x\n"
    assert (folder / ".gitignore").read_text() == "__pycache__/\n.venv/\n"
