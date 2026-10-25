"""Runs in a terminal tab instead of `ssh -t ... tmux attach`: talks to tmux in control mode (control.py) and
looks like a normal program to the terminal, so its scrollback, selection and resizing all just work.

    python3 cc_bridge.py --fallback '<json argv>' -- <ssh argv that ends in tmux -C attach>

When the cluster has no tmux the remote line prints NO_TMUX, and the fallback (the old ssh -t) takes over.
"""

import argparse
import json
import os
import selectors
import signal
import struct
import subprocess
import sys
import time

if __package__ in (None, ""):  # run as a file: find the hpc_hub package next to us
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from hpc_hub.terminals import control  # noqa: E402

NO_TMUX = control.NO_TMUX.encode()
RESTORE_WAIT = 8.0  # seconds to wait for tmux's answers before showing output anyway


def _size(fd: int) -> tuple[int, int]:
    import fcntl
    import termios
    try:
        rows, cols, _, _ = struct.unpack("HHHH", fcntl.ioctl(fd, termios.TIOCGWINSZ, b"\0" * 8))
        return cols or 80, rows or 24
    except OSError:
        return 80, 24


def _write(fd: int, data: bytes) -> None:
    while data:
        data = data[os.write(fd, data):]


def run(command: list[str], fallback: list[str], fd_in: int = 0, fd_out: int = 1) -> int:
    import termios
    import tty
    cols, rows = _size(fd_out)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
    reader = control.Reader(cols, rows)

    def send(commands: list[str]) -> None:
        for line in control.command_lines(commands):
            proc.stdin.write(line.encode() + b"\n")

    send(control.restore_commands(cols, rows))
    saved = termios.tcgetattr(fd_in) if os.isatty(fd_in) else None
    if saved:
        tty.setraw(fd_in)
    wake_r, wake_w = os.pipe()
    os.set_blocking(wake_w, False)
    signal.set_wakeup_fd(wake_w)
    signal.signal(signal.SIGWINCH, lambda *_: None)
    for sig in (signal.SIGHUP, signal.SIGTERM):
        signal.signal(sig, lambda *_: sys.exit(0))  # the tab closed: detach (the session keeps running)
    sel = selectors.DefaultSelector()
    sel.register(proc.stdout, selectors.EVENT_READ, "tmux")
    sel.register(fd_in, selectors.EVENT_READ, "keys")
    sel.register(wake_r, selectors.EVENT_READ, "signal")
    started, buf, run_fallback = time.monotonic(), b"", False
    try:
        while not reader.exited:
            if not reader.restored and time.monotonic() - started > RESTORE_WAIT:
                reader.give_up_restoring()
            for key, _ in sel.select(timeout=0.5):
                if key.data == "tmux":
                    chunk = os.read(proc.stdout.fileno(), 65536)
                    if not chunk:
                        return proc.wait()
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line = line.rstrip(b"\r")
                        if line == NO_TMUX:
                            run_fallback = True
                            return 0
                        if not line.startswith(b"%") and not reader.restored and not reader.in_block:
                            _write(fd_out, line + b"\r\n")  # a message from the cluster (an error, a login banner)
                            continue
                        _write(fd_out, reader.line(line))
                elif key.data == "keys":
                    data = os.read(fd_in, 65536)
                    if not data:
                        return 0
                    send(control.keys(data))
                else:
                    os.read(wake_r, 512)
                    size = _size(fd_out)
                    if size != (reader.cols, reader.rows):
                        reader.cols, reader.rows = size
                        send([control.size_command(*size)])
        return 0
    except BrokenPipeError:
        return proc.wait()
    finally:
        if saved:
            termios.tcsetattr(fd_in, termios.TCSADRAIN, saved)
        if proc.poll() is None:
            proc.terminate()
        if run_fallback and fallback:
            os.execvp(fallback[0], fallback)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--fallback", default="[]", help="argv (JSON) to run when the cluster has no tmux")
    p.add_argument("command", nargs=argparse.REMAINDER)
    a = p.parse_args(argv)
    command = a.command[1:] if a.command[:1] == ["--"] else a.command
    return run(command, json.loads(a.fallback))


if __name__ == "__main__":
    sys.exit(main())
