import fcntl
import os
import pty
import select
import shutil
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path

import pytest

from hpc_hub.terminals import control, tmux


def test_unescape_output():
    assert control.unescape(rb"hi\015\012\033[1mx\134") == b"hi\r\n\x1b[1mx\\"


def test_keys_go_as_tmux_commands():
    assert control.keys(b"ls -la\r") == ["send-keys -l -- 'ls -la'", "send-keys 'Enter'"]
    assert control.keys(b"\x1b[A") == ["send-keys 'Escape'", "send-keys -l -- '[A'"]  # arrow up
    assert control.keys(b"\x03\x7f\t") == ["send-keys 'C-c'", "send-keys 'BSpace'", "send-keys 'Tab'"]
    assert control.keys("it's ü".encode()) == ["send-keys -l -- 'it'", "send-keys -l -- \"'\"",
                                               "send-keys -l -- 's ü'"]
    assert control.command_lines(["a", "b", "c"], limit=5) == ["a ; b", "c"]


def test_reader_restores_then_follows_output():
    r = control.Reader(cols=20, rows=4)
    assert r.line(b"%begin 1 1 0") == b"" and r.line(b"%end 1 1 0") == b""  # the attach itself
    assert r.line(b"%output %1 early") == b""  # before the capture: already in it
    for line in (b"%begin 1 2 1", b"%end 1 2 1",  # refresh-client
                 b"%begin 1 3 1", b"hpchub-state|%1|2|1|0|2|2|1|1|0|1||||", b"%end 1 3 1",
                 b"%begin 1 4 1", b"old 1", b"old 2", b"%end 1 4 1",
                 b"%begin 1 5 1", b"$ ls", b"$ %end not ours", b"%end 1 5 1"):
        out = r.line(line)
    assert r.restored
    assert out.startswith(b"old 1\x1b[0m\r\nold 2\x1b[0m\r\n$ ls\x1b[0m\r\n$ %end not ours\x1b[0m")
    assert b"\x1b[4;3H" in out  # cursor (2,1) under 2 history rows
    assert out.endswith(b"\x1b[?1h\x1b[?2004h")  # application cursor keys and bracketed paste back on
    assert r.line(rb"%output %1 new\015\012") == b"new\r\n"
    r.line(b"%exit")
    assert r.exited


def test_state_from_an_old_tmux_with_empty_names():
    s = control.PaneState.parse("hpchub-state|%0|5|3|1|24|0")
    assert (s.cursor_x, s.cursor_y, s.alternate, s.height) == (5, 3, True, 24) and not any(s.flags.values())


def test_tab_argv_runs_the_bridge_with_plain_ssh_as_fallback():
    class Ssh:
        def argv(self, command=None, tty=False):
            return ["ssh", *(["-tt"] if tty else []), "h", command]
    argv = tmux.tab_argv(Ssh(), "hpchub-term-1", "bash -l", node="n1")
    assert argv[0] == sys.executable and argv[1].endswith("cc_bridge.py")
    assert "-tt" in argv[3] and "tmux attach-session" in argv[3]  # fallback
    assert "-tt" not in argv[5:] and "tmux -u -C attach-session" in argv[-1] and control.NO_TMUX in argv[-1]


# -- the bridge against a real local tmux ----------------------------------------------------

def _read_until(fd: int, want: bytes, seconds: float = 10) -> bytes:
    got, end = b"", time.monotonic() + seconds
    while want not in got and time.monotonic() < end:
        if select.select([fd], [], [], 0.2)[0]:
            try:
                got += os.read(fd, 65536)
            except OSError:
                break
    return got


@pytest.mark.skipif(not shutil.which("tmux"), reason="needs tmux")
def test_bridge_shows_history_and_types(tmp_path):
    sock = f"hpchub-test-{os.getpid()}"
    tm = ["tmux", "-L", sock, "-f", "/dev/null"]
    env = {**os.environ, "TMUX": "", "HOME": str(tmp_path), "PS1": "$ "}
    subprocess.run([*tm, "new-session", "-d", "-s", "t", "-x", "80", "-y", "24", "bash --norc --noprofile"],
                   check=True, env=env)
    try:
        subprocess.run([*tm, "send-keys", "-t", "t", "seq 1 500", "Enter"], check=True)
        time.sleep(0.5)
        bridge = str(Path(control.__file__).with_name("cc_bridge.py"))
        pid, fd = pty.fork()
        if pid == 0:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
            os.execve(sys.executable, [sys.executable, bridge, "--", *tm, "-u", "-C", "attach", "-t", "=t"], env)
        got = _read_until(fd, b"500")
        assert b"\r\n2\x1b[0m\r\n3\x1b[0m\r\n" in got  # the history, not just the last screen
        os.write(fd, b"echo 'it''s ok' \x1b[D\x1b[C\r")  # quotes and arrow keys reach the shell
        assert b"its ok" in _read_until(fd, b"its ok")
        os.kill(pid, 1)  # the tab closes
        os.waitpid(pid, 0)
        time.sleep(0.3)
        alive = subprocess.run([*tm, "has-session", "-t", "=t"])
        assert alive.returncode == 0  # detached, still running
    finally:
        subprocess.run([*tm, "kill-server"], capture_output=True)
