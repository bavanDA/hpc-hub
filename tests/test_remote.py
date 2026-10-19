import shlex

from hpc_hub import remote

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


def test_on_node_in_tmux():
    from hpc_hub import tmux
    cmd = tmux.open_line("hpchub-claude-42", remote.on_node("42", "~/proj", "claude"))
    assert cmd.startswith("if command -v tmux")
    # the tmux payload is one shell word that runs srun on the job
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    words = list(lex)
    payload = words[words.index("new-session") + 4]  # new-session -d -s NAME <payload>
    assert payload.startswith("srun --jobid=42 --overlap --pty bash -ic")
    assert "claude; exec bash -i" in shlex.split(payload)[-1]
