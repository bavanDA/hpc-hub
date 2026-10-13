"""One SSH ControlMaster per cluster. Login (and Duo) happens once; later commands reuse it."""

import socket
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable

from .config import ClusterConfig
from .paths import runtime_dir

COMMON = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
]


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

    def run(self, command: str, timeout: float = 60) -> subprocess.CompletedProcess:
        return subprocess.run(
            self.argv(command), capture_output=True, text=True, timeout=timeout,
            stdin=subprocess.DEVNULL,
        )

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
        return ["scp", "-r", "-q", "-o", "ControlMaster=no", "-o", "BatchMode=yes", "-o", f"ControlPath={self.control_path}",
                "-o", f"User={self.username}", "-P", str(self.cfg.port), "--", fix(src), fix(dst)]

    def stop(self) -> None:
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
