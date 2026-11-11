"""One SSH ControlMaster per cluster, so Duo is asked once. Windows' OpenSSH has none: there it is ssh_async.py."""

import os
import shlex
import socket
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable

from .config import ClusterConfig
from .fastshell import NODE_SLOTS, FastShell, FastShellError
from .paths import WINDOWS, runtime_dir

COMMON = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
]


FAST_SHELLS = 3  # quick commands share these; more at once (or long ones) use plain ssh
NODE_SHELLS = 2  # shells kept open on compute nodes: each holds a session under the server's MaxSessions
NODE_SSH = "ssh -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR"
CHANNEL = "hpc-hub-channel"  # argv(tty=True) of a login no local ssh can ride: [CHANNEL, cluster id, command]


REFUSED = "Session open refused by peer"
REFUSED_WAITS = (0.5, 1.5, 3)
PLAIN_SESSIONS = 4  # plain ssh commands at once: with the fast shells and terminals, under the server's MaxSessions


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
        self._idle: list[FastShell] = []  # one entry per free slot
        self._open: set[FastShell] = set()
        self._shells = 0
        self._shell_lock = threading.Lock()
        self._plain = threading.BoundedSemaphore(PLAIN_SESSIONS)
        self._fast_off_until = 0.0  # after a failed start, use plain ssh for a while
        self.work_node = ""  # the running job's node: read() prefers it
        self._node_off: dict[str, float] = {}  # node -> no shell there until then
        self._node_shells: dict[str, tuple[FastShell | None, threading.Lock]] = {}  # job id or node -> shell

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
        key = ["-i", self.cfg.ssh_key] if self.cfg.ssh_key else []  # the key you picked, besides ssh's own
        argv = ["ssh", "-M", "-N", "-o", "ControlMaster=yes", "-o", "ControlPersist=no", *COMMON, *key,
                *self._target()]
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
        """On the running job's node, with no job on the login node. A command that may have run isn't run twice."""
        shell = self._shell_on(self.work_node) if self.work_node else None
        if shell:
            try:
                return shell.run(command, timeout)
            except FastShellError as e:
                if e.sent:
                    return subprocess.CompletedProcess(command, 255, "", f"connection to the node broke: {e}")
        return self.on_login(command, timeout, fast)

    def on_login(self, command: str, timeout: float = 60, fast: bool | None = None) -> subprocess.CompletedProcess:
        """For what lives on the login node or must outlast the job. Quick commands (or fast=True) go through a
        shell kept open there; the rest through plain ssh."""
        shell = self._take_shell() if (timeout <= 60 if fast is None else fast) else None
        if shell:
            try:
                return shell.run(command, timeout)
            except FastShellError as e:
                if e.sent:  # it may have run: don't run it twice (think sbatch)
                    return subprocess.CompletedProcess(command, 255, "", f"connection to the cluster broke: {e}")
            finally:
                self._return_shell(shell)
        return self._run_plain(command, timeout)

    def read(self, command: str, timeout: float = 60, fast: bool | None = None) -> subprocess.CompletedProcess:
        """A read-only command, safe to repeat: on the running job's node, else on the login node."""
        if self.work_node:
            res = self.run_on_host(self.work_node, command, timeout)
            if res is not None and res.returncode != 127:  # 127: that node lacks the tool
                return res
        return self.on_login(command, timeout, fast)

    def node_argv(self, command: str) -> list[str]:
        """argv for a command fed on stdin (a kept shell can't): on the running job's node when there is one."""
        if self.work_node and self._shell_on(self.work_node):
            command = f"{NODE_SSH} {shlex.quote(self.work_node)} {shlex.quote(command)}"
        return self.argv(command)

    def _run_plain(self, command: str, timeout: float) -> subprocess.CompletedProcess:
        for wait in (*REFUSED_WAITS, None):
            with self._plain:  # a burst (History opening) waits here instead of being refused by the server
                res = subprocess.run(
                    self.argv(command), capture_output=True, text=True, timeout=timeout,
                    stdin=subprocess.DEVNULL,
                )
            # the server's limit of sessions on one connection (MaxSessions): nothing ran, so wait for a free one
            if wait is None or REFUSED not in res.stderr:
                return res
            time.sleep(wait)
        return res

    def _new_shell(self, **kwargs) -> FastShell:
        return FastShell(self.argv(), **kwargs)

    def _take_shell(self) -> FastShell | None:
        with self._shell_lock:
            if self._idle:
                return self._idle.pop()
            if self._shells >= FAST_SHELLS or time.monotonic() < self._fast_off_until:
                return None
            self._shells += 1
        try:
            shell = self._new_shell()
        except FastShellError:
            with self._shell_lock:
                self._shells -= 1
                self._fast_off_until = time.monotonic() + 120
            return None
        with self._shell_lock:
            self._open.add(shell)
            self._idle.extend([shell] * (getattr(shell, "slots", 1) - 1))
        return shell

    def _return_shell(self, shell: FastShell) -> None:
        with self._shell_lock:
            if shell.alive:
                self._idle.append(shell)
            elif shell in self._open:  # several commands can come back from one dead shell
                self._open.discard(shell)
                self._idle = [s for s in self._idle if s is not shell]
                self._shells -= 1

    def close_shells(self) -> None:
        with self._shell_lock:
            shells, self._open, self._idle, self._shells = self._open, set(), [], 0
            nodes, self._node_shells = self._node_shells, {}
        for shell in [*shells, *(sh for sh, _ in nodes.values() if sh)]:  # a node whose shell failed has None
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
                    shell = self._new_shell(timeout=60,
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

    def run_on_host(self, node: str, command: str, timeout: float = 15) -> subprocess.CompletedProcess | None:
        """A quick read-only command on a compute node, through a shell kept open there with ssh: srun's /tmp is
        the job's own, so only ssh sees the node's tmux. None: no shell for it, run it another way."""
        shell = self._shell_on(node)
        if not shell:
            return None
        try:
            return shell.run(command, timeout)
        except (FastShellError, subprocess.TimeoutExpired):
            return None

    def _shell_on(self, node: str) -> FastShell | None:
        with self._shell_lock:
            if time.monotonic() < self._node_off.get(node, 0):
                return None
            open_now = sum(1 for sh, _ in self._node_shells.values() if sh and sh.alive)
            shell, lock = self._node_shells.get(node, (None, None))
            if not (shell and shell.alive) and open_now >= NODE_SHELLS:
                return None
            if lock is None:
                lock = threading.Lock()
                self._node_shells[node] = (None, lock)
        with lock:  # commands arriving together share one new shell
            shell = self._node_shells.get(node, (None, None))[0]
            if shell is None or not shell.alive:
                try:
                    shell = self._new_shell(timeout=20, slots=NODE_SLOTS,
                                            launcher=f"exec {NODE_SSH} {shlex.quote(node)} bash --norc --noprofile")
                except FastShellError:
                    shell = None
                    self._node_off[node] = time.monotonic() + 60  # the job may be over: don't try on every command
                with self._shell_lock:
                    self._node_shells[node] = (shell, lock)
        return shell

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


def backend() -> str:
    """openssh (a ControlMaster per cluster) on Linux and macOS, asyncssh on Windows. HPC_HUB_SSH picks one."""
    return os.environ.get("HPC_HUB_SSH") or ("asyncssh" if WINDOWS else "openssh")


def new_master(cfg: ClusterConfig, username: str, env: dict, log: Callable[[str], None],
               ask: Callable[[str], str | None] | None = None) -> SshMaster:
    """The SSH login for one cluster. ask answers login questions (password, Duo, code) where no askpass
    helper can: asyncssh asks it directly; OpenSSH asks through env's askpass socket."""
    if backend() == "asyncssh":
        from .ssh_async import AsyncSshMaster
        return AsyncSshMaster(cfg, username, env, log, ask)
    return SshMaster(cfg, username, env, log)
