import shutil
import subprocess

import pytest

from hpc_hub import tmux

SCREEN = """There are screens on:
\t12345.build\t(10/19/2026 01:02:03 PM)\t(Detached)
\t678.work\t(Attached)
2 Sockets in /run/screen/S-me.
"""


def test_parse():
    row = tmux.SEP.join(["hpchub-claude-42-131802", "1792430282", "1", "MC paper", "#d97757", "srun", "1", "/h"])
    text = f"login02\nTMUX_OK\n{row}\nSCREEN_LIST\n{SCREEN}"
    got = tmux.parse(text)
    assert got.host == "login02" and got.has_tmux
    t = got.sessions[0]
    assert (t.name, t.title, t.color, t.attached, t.agent, t.command) == (
        "hpchub-claude-42-131802", "MC paper", "#d97757", 1, "claude", "srun")
    assert [(s.name, s.kind, s.attached) for s in got.sessions[1:]] == [("12345.build", "screen", 0),
                                                                     ("678.work", "screen", 1)]


def test_job_nodes():
    row = tmux.SEP.join(["hpchub-codex-1429952-170139", "1", "0", "", "", "srun", "1", "/h"])
    got = tmux.parse(f"login02\nTMUX_OK\n{row}\nSCREEN_LIST\nJOB_LIST\n1429952 n0093\n1429907 n0052\n")
    assert got.sessions[0].job == "1429952" and got.nodes == {"1429952": "n0093", "1429907": "n0052"}
    assert tmux.parse("login02\nTMUX_OK\nSCREEN_LIST\nJOB_LIST\n").nodes == {}
    assert tmux.parse("login02\nTMUX_OK\nSCREEN_LIST\n").nodes is None
    assert tmux.Session("hpchub-term-170139").job == ""


def test_no_tmux():
    got = tmux.parse("login01\nSCREEN_LIST\nNo Sockets found in /run/screen/S-me.\n")
    assert not got.has_tmux and got.sessions == []


@pytest.mark.skipif(not shutil.which("tmux"), reason="tmux not installed")
def test_real_tmux(tmp_path, monkeypatch):
    monkeypatch.setenv("TMUX_TMPDIR", str(tmp_path))

    def sh(line):
        res = subprocess.run(["bash", "-c", line], capture_output=True, text=True)
        assert res.returncode == 0 or "SCREEN_LIST" in res.stdout, res.stderr
        return res.stdout

    sh(tmux.create("hpchub-term-1", "sleep 60", label="My shell", color="#e01b24"))
    sh(tmux.create("hpchub-term-1", "sleep 60", label="ignored"))  # already there: untouched
    s = tmux.parse(sh(tmux.LIST)).sessions
    assert [(x.name, x.label, x.color) for x in s] == [("hpchub-term-1", "My shell", "#e01b24")]
    sh(tmux.set_label(s[0], "renamed") + " && " + tmux.set_color(s[0], "#2ec27e"))
    s = tmux.parse(sh(tmux.LIST)).sessions
    assert (s[0].label, s[0].color) == ("renamed", "#2ec27e")
    sh(tmux.kill(s[0]))
    subprocess.run(["tmux", "kill-server"], capture_output=True)
    assert tmux.parse(sh(tmux.LIST)).sessions == []


def test_open_line_is_valid_shell():
    line = tmux.open_line("hpchub-claude-1-x", "srun --pty bash -ic 'cd ~ && claude'", "Claude · MC", "#d97757")
    assert subprocess.run(["bash", "-n", "-c", line]).returncode == 0
    assert "exec tmux attach-session -t =hpchub-claude-1-x" in line
