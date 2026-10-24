import shlex
import subprocess

from hpc_hub.core import remote

ALIASES = """alias ll='ls -l'
alias vscode='code tunnel --accept-server-license-terms --name bouchet'
alias q='squeue --me'
alias say='echo '\\''hi'\\'''
declare -f module
declare -f code_web
declare -f _private
"""


def test_parse_aliases():
    a = remote.parse_aliases(ALIASES)
    assert a["vscode"].startswith("code tunnel")
    assert a["say"] == "echo 'hi'"
    assert a["module"] == "(function)"


def test_vscode_candidates():
    names = remote.vscode_candidates(remote.parse_aliases(ALIASES))
    assert names[:2] == ["vscode", "code_web"]
    assert "ll" not in names and "_private" not in names


def test_cd_part():
    assert remote.cd_part("~") == 'cd "$HOME"'
    assert remote.cd_part("~/my dir") == "cd \"$HOME\"/'my dir'"
    assert remote.cd_part("/scratch/x") == "cd /scratch/x"


def test_agent_tmux_runs_on_the_node():
    from hpc_hub.terminals import tmux
    line = tmux.open_line("hpchub-claude-42-x", remote.node_shell("~/proj", "claude"), node="n0076")
    words = shlex.split(line)
    assert words[:2] == ["exec", "ssh"] and "-t" in words and words[-2] == "n0076"
    inner = words[-1]  # the whole tmux line runs on the node
    assert inner.startswith("if command -v tmux") and "srun" not in line
    assert "new-session -d -s hpchub-claude-42-x 'bash -ic " in inner and "claude; exec bash -i" in inner
    assert subprocess.run(["bash", "-n", "-c", line]).returncode == 0