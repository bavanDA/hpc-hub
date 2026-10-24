"""One SSH ControlMaster per cluster. Login (and Duo) happens once; later commands reuse it."""

import shlex
import socket
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable

from .config import ClusterConfig
from .fastshell import FastShell, FastShellError
from .paths import runtime_dir

COMMON = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
]


FAST_SHELLS = 3  # quick commands share these; more at once (or long ones) use plain ssh


class SshError(Exception):
    pass


class SshMaster:
    def __init__(self, cfg: ClusterConfig, username: str, env: dict, log: Callable[[str], None]):
        self.cfg = cfg
        self.username = username
        self.env = env
        self.log = log
        self.control_path = runtime_dir() / f"cm-{cfg.id}"
        self.proc: subprocess.Popen | None = None
        self._errors: deque[str] = deque(maxlen=8)
        self._idle: list[FastShell] = []
        self._shells = 0
        self._shell_lock = threading.Lock()
        self._fast_off_until = 0.0  # after a failed start, use plain ssh for a while
        self._node_shells: dict[str, tuple[FastShell | None, threading.Lock]] = {}  # job id -> shell on its node

    def _target(self) -> list[str]:
        return ["-p", str(self.cfg.port), "-l", self.username, "-S", str(self.control_path), "--", self.cfg.host]

    def argv(self, command: str | None = None, tty: bool = False) -> list[str]:
        """ssh argv that rides the existing master (never prompts)."""
        argv = ["ssh", "-o", "ControlMaster=no", "-o", "BatchMode=yes", *COMMON]
        if tty:
            argv.append("-tt")
        argv += self._target()
        if command:
            argv.append(command)
        return argv

    def start(self, timeout: float = 180, cancelled: Callable[[], bool] = lambda: False) -> None:
        if self.alive():
            return
        self.control_path.unlink(missing_ok=True)
        argv = ["ssh", "-M", "-N", "-o", "ControlMaster=yes", "-o", "ControlPersist=no", *COMMON, *self._target()]
        self.proc = subprocess.Popen(
            argv, env=self.env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, text=True, start_new_session=True,
        )
        threading.Thread(target=self._read_errors, args=(self.proc,), daemon=True).start()

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise SshError(self._last_error() or "SSH login failed")
            if self.alive():
                return
            if cancelled():
                self.stop()
                raise SshError("Cancelled")
            time.sleep(0.5)
        self.stop()
        raise SshError("SSH login timed out")

    def _read_errors(self, proc: subprocess.Popen) -> None:
        for line in proc.stderr:
            line = line.rstrip()
            if line:
                self._errors.append(line)
                self.log(f"ssh: {line}")

    def _last_error(self) -> str:
        time.sleep(0.2)
        return self._errors[-1] if self._errors else ""

    def alive(self) -> bool:
        if not self.control_path.exists():
            return False
        check = ["ssh", "-O", "check", *self._target()]
        return subprocess.run(check, capture_output=True).returncode == 0

    def run(self, command: str, timeout: float = 60, fast: bool | None = None) -> subprocess.CompletedProcess:
        """Quick commands (or fast=True) go through a shell kept open on the login node; the rest through
        plain ssh."""
        shell = self._take_shell() if (timeout <= 60 if fast is None else fast) else None
        if shell:
            try:
                res = shell.run(command, timeout)
            except subprocess.TimeoutExpired:
                self._drop_shell()
                raise
            except FastShellError as e:
                self._drop_shell()
                if e.sent:  # it may have run: don't run it twice (think sbatch)
                    return subprocess.CompletedProcess(command, 255, "", f"connection to the cluster broke: {e}")
            else:
                self._return_shell(shell)
                return res
        return subprocess.run(
            self.argv(command), capture_output=True, text=True, timeout=timeout,
            stdin=subprocess.DEVNULL,
        )

    def _take_shell(self) -> FastShell | None:
        with self._shell_lock:
            if self._idle:
                return self._idle.pop()
            if self._shells >= FAST_SHELLS or time.monotonic() < self._fast_off_until:
                return None
            self._shells += 1
        try:
            return FastShell(self.argv())
        except FastShellError:
            with self._shell_lock:
                self._shells -= 1
                self._fast_off_until = time.monotonic() + 120
            return None

    def _return_shell(self, shell: FastShell) -> None:
        with self._shell_lock:
            if shell.alive:
                self._idle.append(shell)
            else:
                self._shells -= 1

    def _drop_shell(self) -> None:
        with self._shell_lock:
            self._shells -= 1

    def close_shells(self) -> None:
        with self._shell_lock:
            idle, self._idle = self._idle, []
            self._shells -= len(idle)
            nodes, self._node_shells = self._node_shells, {}
        for shell in idle + [sh for sh, _ in nodes.values()]:
            shell.close()

    def run_on_node(self, job_id: str, command: str, timeout: float = 900) -> subprocess.CompletedProcess:
        """Run on the job's node through a shell kept open there (no srun start-up each time)."""
        job = str(int(job_id))
        with self._shell_lock:
            shell, lock = self._node_shells.get(job, (None, None))
            if lock is None:
                lock = threading.Lock()
                self._node_shells[job] = (None, lock)
        with lock:
            if shell is None or not shell.alive:
                try:
                    shell = FastShell(self.argv(), timeout=60,
                                      launcher=f"exec srun --jobid={job} --overlap bash --norc --noprofile")
                except FastShellError:
                    shell = None
                with self._shell_lock:
                    self._node_shells[job] = (shell, lock)
            if shell:
                try:
                    return shell.run(command, timeout)
                except FastShellError as e:
                    if e.sent:
                        return subprocess.CompletedProcess(command, 255, "", f"connection to the node broke: {e}")
        return self.run(f"srun --jobid={job} --overlap bash -c {shlex.quote(command)}", timeout, fast=True)

    def popen(self, command: str, **kwargs) -> subprocess.Popen:
        return subprocess.Popen(self.argv(command), stdin=subprocess.DEVNULL, text=True, **kwargs)

    def forward(self, remote_host: str, remote_port: int) -> int:
        """Forward a free local port to remote_host:remote_port through the master."""
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            local = probe.getsockname()[1]
        spec = f"127.0.0.1:{local}:{remote_host}:{int(remote_port)}"
        res = subprocess.run(["ssh", "-O", "forward", "-L", spec, *self._target()], capture_output=True, text=True)
        if res.returncode != 0:
            raise SshError(res.stderr.strip() or "Port forward failed")
        return local

    def copy_argv(self, src: str, dst: str) -> list[str]:
        """scp argv riding the master. Remote paths are written as ':path'."""
        fix = lambda p: f"{self.cfg.host}:{p[1:]}" if p.startswith(":") else p  # noqa: E731
        return ["scp", "-r", "-q", "-o", "ControlMaster=no", "-o", "BatchMode=yes",
                "-o", f"ControlPath={self.control_path}", "-o", f"User={self.username}", "-P", str(self.cfg.port),
                "--", fix(src), fix(dst)]

    def stop(self) -> None:
        self.close_shells()
        if self.control_path.exists():
            subprocess.run(["ssh", "-O", "exit", *self._target()], capture_output=True)
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None
        self.control_path.unlink(missing_ok=True)
