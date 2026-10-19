"""A shell kept open on the login node, so quick commands skip your .bashrc (about 0.7 s each on Wulver).

Each command runs in a subshell with its output in temp files; we read back the exit code and both outputs.
"""

import os
import selectors
import subprocess
import time
import uuid

START = ('T=$(mktemp -d /dev/shm/hpchub.XXXXXX 2>/dev/null || mktemp -d); trap \'rm -rf "$T"\' EXIT; '
         'echo "$1"\n')


class FastShellError(Exception):
    def __init__(self, message: str, sent: bool = False):
        super().__init__(message)
        self.sent = sent  # True: the command may have run, so it must not be run again


def wrap(command: str, token: str) -> str:
    """Shell text for one command: run it, then print 'token rc out_bytes err_bytes' and both outputs."""
    return (f"( {command}\n) >\"$T/o\" 2>\"$T/e\" </dev/null; rc=$?; "
            f"printf '%s %d %d %d\\n' {token} \"$rc\" \"$(stat -c%s \"$T/o\")\" \"$(stat -c%s \"$T/e\")\"; "
            "cat \"$T/o\" \"$T/e\"\n")


class FastShell:
    def __init__(self, argv: list[str], timeout: float = 20):
        ready = f"HPCHUB_READY_{uuid.uuid4().hex}"
        script = "exec bash --norc --noprofile -s " + ready  # stdin is the script; $1 is the ready word
        self.proc = subprocess.Popen([*argv, script], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
        self.sel = selectors.DefaultSelector()
        self.sel.register(self.proc.stdout, selectors.EVENT_READ)
        self.buf = b""
        try:
            self._send(START)
            self._line_with(ready.encode(), time.monotonic() + timeout)
        except (FastShellError, OSError):
            self.close()
            raise FastShellError("fast shell did not start")

    @property
    def alive(self) -> bool:
        return self.proc.poll() is None

    def close(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        self.sel.close()

    def _send(self, text: str) -> None:
        self.proc.stdin.write(text.encode())
        self.proc.stdin.flush()

    def _fill(self, deadline: float) -> None:
        left = deadline - time.monotonic()
        if left <= 0 or not self.sel.select(left):
            raise TimeoutError
        chunk = os.read(self.proc.stdout.fileno(), 65536)
        if not chunk:
            raise FastShellError("shell closed")
        self.buf += chunk

    def _line_with(self, word: bytes, deadline: float) -> bytes:
        while True:
            for line in self.buf.split(b"\n")[:-1]:
                if word in line:
                    self.buf = self.buf.split(line + b"\n", 1)[1]
                    return line
            self._fill(deadline)

    def _take(self, n: int, deadline: float) -> bytes:
        while len(self.buf) < n:
            self._fill(deadline)
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def run(self, command: str, timeout: float = 60) -> subprocess.CompletedProcess:
        token = f"HPCHUB_{uuid.uuid4().hex}"
        deadline = time.monotonic() + timeout
        try:
            self._send(wrap(command, token))
        except OSError as e:
            self.close()
            raise FastShellError(str(e))
        try:
            head = self._line_with(token.encode(), deadline).split()
            rc, n_out, n_err = int(head[1]), int(head[2]), int(head[3])
            out, err = self._take(n_out, deadline), self._take(n_err, deadline)
        except TimeoutError:
            self.close()  # the command may still be running; this shell is done
            raise subprocess.TimeoutExpired(command, timeout)
        except (OSError, ValueError, IndexError, FastShellError) as e:
            self.close()
            raise FastShellError(str(e), sent=True)
        return subprocess.CompletedProcess(command, rc, out.decode(errors="replace"), err.decode(errors="replace"))
