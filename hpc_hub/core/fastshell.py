"""A shell kept open on a cluster, so quick commands skip your .bashrc (about 0.7 s each on Wulver), several at once."""

import os
import selectors
import subprocess
import threading
import time
import uuid

SLOTS = 4  # commands one shell runs at once on the login node, which allows little CPU; more wait their turn
NODE_SLOTS = 16  # the same on a compute node: most of these wait on the disk or Slurm, not the CPU
START = ('T=$(mktemp -d /dev/shm/hpchub.XXXXXX 2>/dev/null || mktemp -d); trap \'rm -rf "$T"\' EXIT; '
         'stop() { for c in $(pgrep -P "$1"); do stop "$c"; done; kill "$1" 2>/dev/null; }; '
         'echo "$1"\n')


class FastShellError(Exception):
    def __init__(self, message: str, sent: bool = False):
        super().__init__(message)
        self.sent = sent  # True: the command may have run, so it must not be run again


def wrap(command: str, token: str) -> str:
    """Shell text for one command: run it in the background with its own files, then print 'token rc out_bytes
    err_bytes' and both outputs. Only the command itself can be stopped, never the printing, and the lock (mkdir is
    atomic) keeps results whole."""
    o, e, p = f'"$T/{token}.o"', f'"$T/{token}.e"', f'"$T/{token}.p"'
    return (f"{{ ( {command}\n) >{o} 2>{e} </dev/null & c=$!; echo $c >{p}; wait $c; rc=$?; "
            'until mkdir "$T/l" 2>/dev/null; do sleep 0.01; done; '
            f"printf '%s %d %d %d\\n' {token} \"$rc\" \"$(stat -c%s {o})\" \"$(stat -c%s {e})\"; "
            f'cat {o} {e}; rm -f {o} {e} {p}; rmdir "$T/l"; }} &\n')


def stop_line(token: str) -> str:
    return f'[ -f "$T/{token}.p" ] && stop "$(cat "$T/{token}.p")"\n'


class _Waiter:
    def __init__(self):
        self.done = threading.Event()
        self.result: subprocess.CompletedProcess | None = None
        self.error = ""


class FastShell:
    def __init__(self, argv: list[str], timeout: float = 20, launcher: str = "exec bash --norc --noprofile",
                 slots: int = SLOTS):
        """launcher starts the shell; e.g. "exec srun --jobid=1 --overlap bash --norc --noprofile" for a node."""
        ready = f"HPCHUB_READY_{uuid.uuid4().hex}"
        script = f"{launcher} -s {ready}"  # stdin is the script; $1 is the ready word
        self.proc = subprocess.Popen([*argv, script], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
        self.sel = selectors.DefaultSelector()
        self.sel.register(self.proc.stdout, selectors.EVENT_READ)
        self.buf = b""
        self.slots = slots
        self._reading = False
        self._dead = False
        self._lock = threading.Lock()  # stdin and the table of commands waiting for a result
        self._waiting: dict[bytes, _Waiter] = {}
        self._free = threading.Semaphore(self.slots)
        try:
            self._send(START)
            self._line_with(ready.encode(), time.monotonic() + timeout)
        except (FastShellError, OSError):
            self.close()
            raise FastShellError("fast shell did not start")
        self._reading = True
        threading.Thread(target=self._read_results, daemon=True).start()

    @property
    def alive(self) -> bool:
        return self.proc.poll() is None and not self._dead

    def close(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        self._give_up("shell closed")
        if not self._reading:  # otherwise the reader sees the end and closes it
            self.sel.close()

    def _give_up(self, error: str) -> None:
        with self._lock:
            self._dead = True
            waiting, self._waiting = self._waiting, {}
        for waiter in waiting.values():
            waiter.error = error
            waiter.done.set()

    def _send(self, text: str) -> None:
        self.proc.stdin.write(text.encode())
        self.proc.stdin.flush()

    def _fill(self, deadline: float | None) -> None:
        left = None if deadline is None else deadline - time.monotonic()
        if (left is not None and left <= 0) or not self.sel.select(left):
            raise TimeoutError
        chunk = os.read(self.proc.stdout.fileno(), 65536)
        if not chunk:
            raise FastShellError("shell closed")
        self.buf += chunk

    def _line_with(self, word: bytes, deadline: float | None) -> bytes:
        while True:
            for line in self.buf.split(b"\n")[:-1]:
                if word in line:
                    self.buf = self.buf.split(line + b"\n", 1)[1]
                    return line
            self._fill(deadline)

    def _take(self, n: int, deadline: float | None) -> bytes:
        while len(self.buf) < n:
            self._fill(deadline)
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _read_results(self) -> None:
        """Hands each result to the command waiting for it; one given up on is dropped."""
        error = "shell closed"
        try:
            while True:
                head = self._line_with(b"HPCHUB_", None).split()
                rc, n_out, n_err = int(head[1]), int(head[2]), int(head[3])
                out, err = self._take(n_out, None), self._take(n_err, None)
                with self._lock:
                    waiter = self._waiting.pop(head[0], None)
                if waiter:
                    waiter.result = subprocess.CompletedProcess(
                        "", rc, out.decode(errors="replace"), err.decode(errors="replace"))
                    waiter.done.set()
        except (OSError, ValueError, IndexError, FastShellError) as e:
            error = str(e) or error
        self._give_up(error)
        self.close()
        self.sel.close()

    def run(self, command: str, timeout: float = 60) -> subprocess.CompletedProcess:
        deadline = time.monotonic() + timeout
        if not self._free.acquire(timeout=timeout):
            raise subprocess.TimeoutExpired(command, timeout)
        try:
            return self._run(command, timeout, deadline)
        finally:
            self._free.release()

    def _run(self, command: str, timeout: float, deadline: float) -> subprocess.CompletedProcess:
        token = f"HPCHUB_{uuid.uuid4().hex}"
        waiter = _Waiter()
        with self._lock:
            if self._dead:
                raise FastShellError("shell closed")
            self._waiting[token.encode()] = waiter
            try:
                self._send(wrap(command, token))
            except OSError as e:
                del self._waiting[token.encode()]
                raise FastShellError(str(e))
        if not waiter.done.wait(max(0.0, deadline - time.monotonic())):
            with self._lock:
                self._waiting.pop(token.encode(), None)
                try:
                    self._send(stop_line(token))
                except OSError:
                    pass
            raise subprocess.TimeoutExpired(command, timeout)
        if waiter.result is None:
            raise FastShellError(waiter.error, sent=True)
        waiter.result.args = command
        return waiter.result
