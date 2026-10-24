import base64
import re
import subprocess

from hpc_hub import ask_all
from hpc_hub.agents import AGY, CLAUDE, CODEX, CURSOR
from hpc_hub.core.config import AgentSettings


def _ask(discuss=False):
    return ask_all.Ask("~/proj", "~/proj/.hpc-hub/ask/1", "What's wrong with 'main.py'?\n$HOME `x`", [
        (CLAUDE, AgentSettings(command="claude", model="opus")),
        (CODEX, AgentSettings(command="codex", effort="high")),
        (AGY, AgentSettings(command="agy")),
        (CURSOR, AgentSettings(command="cursor-agent")),
    ], discuss)


def test_headless_flags():
    p = '"$OUT/.p"'
    assert ask_all.headless(CLAUDE, AgentSettings(command="claude", model="opus"), p) == \
        'claude -p --add-dir "$OUT" --model opus --permission-mode acceptEdits "$(cat "$OUT/.p")"'
    assert ask_all.headless(CODEX, AgentSettings(command="codex", effort="high"), p) == \
        ('codex --no-daemon exec --skip-git-repo-check --add-dir "$OUT" -s workspace-write '
         '-c model_reasoning_effort=high "$(cat "$OUT/.p")"')
    assert ask_all.headless(AGY, AgentSettings(command="agy"), p) == \
        'agy --add-dir "$OUT" --mode accept-edits -p "$(cat "$OUT/.p")"'
    assert ask_all.headless(CURSOR, AgentSettings(command="cursor-agent"), p) == \
        'cursor-agent -p --trust --add-dir "$OUT" "$(cat "$OUT/.p")"'


def test_shell_path():
    assert ask_all.shell_path("~") == '"$HOME"'
    assert ask_all.shell_path("~/a b") == "\"$HOME\"/'a b'"
    assert ask_all.shell_path("/x") == "/x"


def test_script_is_valid_bash_and_has_rounds():
    one = ask_all.script(_ask())
    two = ask_all.script(_ask(discuss=True))
    for text in (one, two):
        assert subprocess.run(["bash", "-n"], input=text, text=True).returncode == 0
    assert one.count("wait") == 1 and two.count("wait") == 2
    assert "run claude.round2 " in two and "round2" not in one
    prompts = [base64.b64decode(b).decode() for b in re.findall(r"printf %s (\S+) \| base64 -d", two)]
    assert prompts[0] == _ask().prompt  # the user's prompt, untouched
    assert any("write your complete answer as Markdown to ~/proj/.hpc-hub/ask/1/codex.md" in p for p in prompts)
    assert any("Round 2" in p and "cursor.md (Cursor)" in p for p in prompts)


def test_script_runs_with_fake_agents(tmp_path):
    """Fake agents: one writes its own file, one only prints. Both end up as <id>.md."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "claude").write_text('#!/bin/sh\necho "file answer" > "$OUT/claude.md"\n')
    (bin_dir / "codex").write_text('#!/bin/sh\necho "printed answer"\n')
    for f in bin_dir.iterdir():
        f.chmod(0o755)
    ask = ask_all.Ask(str(tmp_path), str(tmp_path / "out"), "hi", [
        (CLAUDE, AgentSettings(command="claude")), (CODEX, AgentSettings(command="codex"))], discuss=True)
    env = {"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(tmp_path)}
    res = subprocess.run(["bash", "-c", ask_all.command(ask)], env=env, capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, res.stderr
    out = tmp_path / "out"
    assert (out / "claude.md").read_text() == "file answer\n"
    assert (out / "codex.md").read_text() == "printed answer\n"
    assert (out / "codex.round2.md").exists() and (out / "prompt.md").read_text() == "hi"
    assert "All done" in res.stdout
