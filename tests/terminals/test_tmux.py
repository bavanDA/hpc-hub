import json
import os
import shutil
import subprocess

import pytest

from hpc_hub.terminals import tmux

SCREEN = """There are screens on:
\t12345.build\t(10/19/2026 01:02:03 PM)\t(Detached)
\t678.work\t(Attached)
2 Sockets in /run/screen/S-me.
"""


def test_parse():
    row = tmux.SEP.join(["hpchub-claude-42-131802", "1792430282", "1", "thesis paper", "#d97757", "srun", "1", "/h"])
    text = f"login02\nTMUX_OK\n{row}\nSCREEN_LIST\n{SCREEN}"
    got = tmux.parse(text)
    assert got.host == "login02" and got.has_tmux
    t = got.sessions[0]
    assert (t.name, t.title, t.color, t.attached, t.agent, t.command) == (
        "hpchub-claude-42-131802", "thesis paper", "#d97757", 1, "claude", "srun")
    assert [(s.name, s.kind, s.attached) for s in got.sessions[1:]] == [("12345.build", "screen", 0),
                                                                     ("678.work", "screen", 1)]


def test_parse_escaped_separator():
    """tmux 3.4 prints the field separator as the four characters \\037."""
    row = "\\037".join(["work", "1792430282", "0", "work", "", "bash", "1", "/h"])
    assert [t.name for t in tmux.parse(f"login02\nTMUX_OK\n{row}\n").sessions] == ["work"]


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

    sh(tmux.create("hpchub-term-1", "sleep 60", label="My shell", color="#e01b24", cwd=str(tmp_path)))
    sh(tmux.create("hpchub-term-1", "sleep 60", label="ignored"))  # already there: untouched
    s = tmux.parse(sh(tmux.LIST)).sessions
    assert [(x.name, x.label, x.color, x.path) for x in s] == [("hpchub-term-1", "My shell", "#e01b24",
                                                                 str(tmp_path))]
    sh(tmux.set_label(s[0], "renamed") + " && " + tmux.set_color(s[0], "#2ec27e"))
    s = tmux.parse(sh(tmux.LIST)).sessions
    assert (s[0].label, s[0].color) == ("renamed", "#2ec27e")
    sh(tmux.kill(s[0]))
    subprocess.run(["tmux", "kill-server"], capture_output=True)
    assert tmux.parse(sh(tmux.LIST)).sessions == []


@pytest.mark.skipif(not shutil.which("tmux"), reason="tmux not installed")
def test_send_text_pastes_several_lines_as_typed(tmp_path, monkeypatch):
    import time

    monkeypatch.setenv("TMUX_TMPDIR", str(tmp_path))
    got = tmp_path / "got.txt"
    subprocess.run(["bash", "-c", tmux.create("hpchub-agent-1", f"cat > {got}")], check=True)
    text = "In ~/proj/train.py lines 40 to 58:\nwhy is 'lr' \"so\" high? $HOME `x`"
    subprocess.run(["bash", "-c", tmux.send_text("hpchub-agent-1", text)], check=True)
    for _ in range(50):
        if got.exists() and got.read_text().endswith("\n") and "high?" in got.read_text():
            break
        time.sleep(0.05)
    subprocess.run(["tmux", "kill-server"], capture_output=True)
    assert got.read_text() == text + "\n"
    with pytest.raises(ValueError, match="too much"):
        tmux.send_text("x", "a" * (tmux.SEND_MAX + 1))
    assert "ssh -o BatchMode=yes" in tmux.send_text("x", "hi", node="n0042")


def test_open_line_is_valid_shell():
    line = tmux.open_line("hpchub-claude-1-x", "srun --pty bash -ic 'cd ~ && claude'", "Claude · thesis", "#d97757")
    assert subprocess.run(["bash", "-n", "-c", line]).returncode == 0
    assert "exec tmux attach-session -t =hpchub-claude-1-x" in line


def test_remote_links():
    text = (f"{tmux.MARK}hpchub-agy-1-2\n  Open\n  https://antigravity.google.com/r/\n  abc-v2\n"
            f"{tmux.MARK}hpchub-codex-1-3\n{{\"manualPairingCode\":\"AB12-CD34\"}}\n{{\"manualPairingCode\":\"ZZ99-YY88\"}}\n"
            f"{tmux.MARK}hpchub-term-4\nplain output\n")
    assert tmux.parse_remotes(text) == {"hpchub-agy-1-2": "https://antigravity.google.com/r/abc-v2",
                                        "hpchub-codex-1-3": "code:ZZ99-YY88"}
    assert "capture-pane -p -J -t =a: -S -3000" in tmux.capture_command([tmux.Session("a")])
    on_node = tmux.capture_command([tmux.Session("b", node="n0076")])
    assert "ssh" in on_node and "n0076" in on_node
    row = tmux.SEP.join(["hpchub-claude-1-2", "1", "0", "", "", "srun", "1", "/h", "https://claude.ai/code/x"])
    assert tmux.parse(f"login02\nTMUX_OK\n{row}\n").sessions[0].remote == "https://claude.ai/code/x"


def test_sessions_on_compute_nodes():
    row = tmux.SEP.join(["hpchub-claude-1440996-1530", "1", "0", "Claude · thesis", "#d97757", "bash", "1", "/h"])
    old = tmux.SEP.join(["hpchub-claude-1431766-0900", "1", "0", "", "", "srun", "1", "/h"])
    got = tmux.parse(f"login02\nTMUX_OK\n{old}\nSCREEN_LIST\nJOB_LIST\n1440996 n0076\n"
                     f"NODE_LIST\n{tmux.NODE_MARK}n0076\n{row}\n{tmux.NODE_MARK}n0080\n")
    where = {t.name: t.node for t in got.sessions}
    assert where == {"hpchub-claude-1440996-1530": "n0076", "hpchub-claude-1431766-0900": ""}
    assert got.nodes == {"1440996": "n0076"}
    t = next(t for t in got.sessions if t.node)
    for line in (tmux.attach(t), tmux.kill(t), tmux.set_label(t, "x"), tmux.set_remote(t, "u")):
        assert "n0076" in line and subprocess.run(["bash", "-n", "-c", line]).returncode == 0
    assert tmux.kill(next(t for t in got.sessions if not t.node)) == "tmux kill-session -t =hpchub-claude-1431766-0900"
    assert "NODE_LIST" in tmux.LIST and subprocess.run(["bash", "-n", "-c", tmux.LIST]).returncode == 0


def test_claude_link_from_transcript(tmp_path):
    chat = tmp_path / ".claude" / "projects" / "-p"
    chat.mkdir(parents=True)
    entry = {"type": "system", "subtype": "bridge_status", "url": "https://claude.ai/code/session_01abc"}
    (chat / "b1aafc4b-1bbe-4f69.jsonl").write_text('{"type": "user"}\n' + json.dumps(entry) + "\n")
    assert tmux._chat_tag("hpchub-claude-1440996-b1aafc4b") == "b1aafc4b"
    assert tmux._chat_tag("hpchub-claude-1440996-153012") == ""
    def run(tag):
        return subprocess.run(["python3", "-c", tmux.CLAUDE_LINK, "no-such-session", tag], capture_output=True,
                              text=True, env={**os.environ, "HOME": str(tmp_path)}).stdout.strip()
    assert run("b1aafc4b") == "https://claude.ai/code/session_01abc"
    assert run("") == ""
    line = tmux.capture_command([tmux.Session("hpchub-claude-1-b1aafc4b", node="n1")])
    assert "n1" in line and subprocess.run(["bash", "-n", "-c", line]).returncode == 0


def test_disconnect_keys():
    panel = ("❯ /remote-control\n  /remote-control is active\n   Remote Control\n\n"
             "     Disconnect this session\n     Show QR code   Scan with your phone\n   ❯ Continue\n\n"
             "   Enter to select · Esc to continue\n")
    assert tmux.disconnect_keys(panel) == ["Up", "Up", "Enter"]
    assert tmux.disconnect_keys("❯ \n") == []


def test_claude_link_follows_on_and_off(tmp_path):
    chat = tmp_path / ".claude" / "projects" / "-p"
    chat.mkdir(parents=True)
    rows = [{"type": "system", "subtype": "bridge_status", "url": "https://claude.ai/code/session_01x",
             "timestamp": "2026-10-23T10:00:00.000Z"},
            {"type": "system", "subtype": "local_command", "timestamp": "2026-10-23T10:05:00.000Z",
             "content": "<local-command-stdout>Remote Control disconnected.</local-command-stdout>"}]
    f = chat / "b1aafc4b-1.jsonl"
    def run():
        return subprocess.run(["python3", "-c", tmux.CLAUDE_LINK, "none", "b1aafc4b"], capture_output=True,
                              text=True, env={**os.environ, "HOME": str(tmp_path)}).stdout.strip()
    f.write_text(json.dumps(rows[0]) + "\n")
    assert run() == "https://claude.ai/code/session_01x"
    f.write_text("".join(json.dumps(r) + "\n" for r in rows))
    assert run() == ""  # turned off: no button
    assert tmux.parse_remotes(f"{tmux.MARK}a\non\n") == {"a": "on"}


def test_attach_says_when_the_terminal_is_gone():
    line = tmux.attach(tmux.Session("hpchub-term-1", "tmux"))
    assert line.startswith("tmux has-session -t =hpchub-term-1") and "has ended" in line
