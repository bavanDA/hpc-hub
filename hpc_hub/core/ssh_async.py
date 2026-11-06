"""SSH without OpenSSH's ControlMaster (Windows): one asyncssh connection per cluster, logged in once.

The same interface as SshMaster. Login questions (password, Duo, code) go to ask, the session's prompt handler.
Quick commands run in shells kept open on the connection (the fastshell protocol), others on channels of their
own. Code that starts ssh.argv(...) or copy_argv(...) as a local process gets the bridge (ssh_bridge.py), which
runs it on this connection. Terminals are PTY channels the backend streams to the UI (open_channel); their
argv(tty=True) is a marker, not a program. Every connection lives on one event loop thread.
"""

import asyncio
import hmac
import json
import os
import secrets
import subprocess
import threading
import uuid
from collections.abc import Awaitable, Callable
from concurrent.futures import wait
from pathlib import Path

import asyncssh

from . import ssh_bridge, tunnels
from .config import ClusterConfig
from .fastshell import START, FastShellError, wrap
from .ssh import CHANNEL, SshError, SshMaster

KNOWN_HOSTS = Path.home() / ".ssh" / "known_hosts"  # where Windows' own OpenSSH keeps them too
OPTIONS: dict = {}  # more asyncssh connect options (tests leave your keys and agent out)
TOKEN = os.environ.setdefault(ssh_bridge.TOKEN_ENV, secrets.token_hex(16))  # children inherit it
AUTH = "publickey,keyboard-interactive,password"
SHELL = "exec bash --norc --noprofile"
TRIES = 3

_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def loop() -> asyncio.AbstractEventLoop:
    global _loop
    with _loop_lock:
        if _loop is None:
            _loop = asyncio.new_event_loop()
            threading.Thread(target=_loop.run_forever, daemon=True, name="asyncssh").start()
    return _loop


async def _wait(awaitable: Awaitable):
    return await awaitable


def call(awaitable: Awaitable, timeout: float | None = None):
    """Await it on the loop and wait for the answer (from any other thread). TimeoutError after timeout."""
    future = asyncio.run_coroutine_threadsafe(_wait(awaitable), loop())
    try:
        return future.result(timeout)
    except TimeoutError:
        future.cancel()
        raise


def soon(fn: Callable, *args) -> None:
    """Call fn on the loop, ignoring errors (the channel may be gone already)."""
    def run():
        try:
            fn(*args)
        except Exception:  # noqa: BLE001
            pass
    loop().call_soon_threadsafe(run)


class _LocalPort:
    """asyncssh's tunnel to a cluster behind the phone's VPN (tunnels.py): the TCP connection goes to the local
    port that leads there, while the login still checks the host key under the cluster's own name."""

    def __init__(self, port: int):
        self.port = port

    async def create_connection(self, session_factory, _host: str, _port: int):
        return await asyncio.get_running_loop().create_connection(session_factory, "127.0.0.1", self.port)


class _Client(asyncssh.SSHClient):
    def __init__(self, master: "AsyncSshMaster"):
        self.m = master
        self.tries = {"password": 0, "kbdint": 0}  # like OpenSSH's NumberOfPasswordPrompts

    def connection_lost(self, exc: Exception | None) -> None:
        self.m._lost = True
        if exc:
            self.m.log(f"ssh: {exc}")

    def auth_banner_received(self, msg: str, lang: str) -> None:
        self.m._log_lines(msg)

    def validate_host_public_key(self, host: str, addr: str, port: int, key: asyncssh.SSHKey) -> bool:
        return self.m._accept_new(host, addr, port, key)

    async def _ask(self, prompt: str) -> str | None:
        if not self.m.ask:
            return None
        return await asyncio.get_running_loop().run_in_executor(None, self.m.ask, prompt)

    def _again(self, method: str) -> bool:
        self.tries[method] += 1
        return self.tries[method] <= TRIES

    async def password_auth_requested(self) -> str | None:
        if not self._again("password"):
            return None
        return await self._ask(f"{self.m.username}@{self.m.cfg.host}'s password: ")  # as OpenSSH asks

    def kbdint_auth_requested(self) -> str | None:
        return "" if self._again("kbdint") else None

    async def kbdint_challenge_received(self, name: str, instructions: str, lang: str,
                                        prompts: list[tuple[str, bool]]) -> list[str] | None:
        self.m._log_lines(f"{name}\n{instructions}")  # OpenSSH prints these; only the prompts are questions
        answers = []
        for prompt, _echo in prompts:
            answer = await self._ask(prompt)
            if answer is None:
                return None
            answers.append(answer)
        return answers


class _Shell:
    """A shell kept open on a channel (fastshell's protocol). Lives on the loop."""

    def __init__(self, proc: asyncssh.SSHClientProcess):
        self.proc = proc
        self.closed = False

    @classmethod
    async def open(cls, conn: asyncssh.SSHClientConnection, timeout: float, launcher: str) -> "_Shell":
        ready = f"HPCHUB_READY_{uuid.uuid4().hex}"
        shell = cls(await conn.create_process(f"{launcher} -s {ready}", encoding=None, stderr=asyncssh.DEVNULL))
        try:
            shell.proc.stdin.write(START.encode())
            await asyncio.wait_for(shell._line_with(ready.encode()), timeout)
        except (FastShellError, OSError, asyncssh.Error, TimeoutError):
            shell.close()
            raise FastShellError("fast shell did not start")
        return shell

    def close(self) -> None:
        self.closed = True
        self.proc.close()

    async def _line_with(self, word: bytes) -> bytes:
        while True:
            line = await self.proc.stdout.readline()
            if not line.endswith(b"\n"):
                raise FastShellError("shell closed")
            if word in line:
                return line

    async def run(self, command: str, timeout: float) -> subprocess.CompletedProcess:
        token = f"HPCHUB_{uuid.uuid4().hex}"
        try:
            self.proc.stdin.write(wrap(command, token).encode())
        except (OSError, asyncssh.Error) as e:
            self.close()
            raise FastShellError(str(e))
        try:
            async with asyncio.timeout(timeout):
                head = (await self._line_with(token.encode())).split()
                rc, n_out, n_err = int(head[1]), int(head[2]), int(head[3])
                out = await self.proc.stdout.readexactly(n_out)
                err = await self.proc.stdout.readexactly(n_err)
        except TimeoutError:
            self.close()  # the command may still be running; this shell is done
            raise subprocess.TimeoutExpired(command, timeout)
        except (OSError, ValueError, IndexError, FastShellError, asyncio.IncompleteReadError, asyncssh.Error) as e:
            self.close()
            raise FastShellError(str(e), sent=True)
        return subprocess.CompletedProcess(command, rc, out.decode(errors="replace"), err.decode(errors="replace"))


class _SyncShell:
    """What SshMaster's shell pool holds: a _Shell, used from worker threads."""

    def __init__(self, master: "AsyncSshMaster", timeout: float = 20, launcher: str = SHELL):
        self.master = master
        conn = master._conn
        if conn is None or not master.alive():
            raise FastShellError("not connected")
        try:
            self.shell = call(_Shell.open(conn, timeout, launcher), timeout + 10)
        except (FastShellError, OSError, asyncssh.Error, TimeoutError):
            raise FastShellError("fast shell did not start")

    @property
    def alive(self) -> bool:
        return not self.shell.closed and self.shell.proc.exit_status is None and self.master.alive()

    def run(self, command: str, timeout: float = 60) -> subprocess.CompletedProcess:
        try:
            return call(self.shell.run(command, timeout), timeout + 10)
        except TimeoutError:
            soon(self.shell.close)
            raise subprocess.TimeoutExpired(command, timeout)

    def close(self) -> None:
        soon(self.shell.close)


class Channel:
    """A terminal: a PTY channel whose output goes to on_data (bytes) and whose end to on_exit (code)."""

    def __init__(self, proc: asyncssh.SSHClientProcess):
        self.proc = proc
        self.task: asyncio.Task | None = None  # its output pump (the loop only keeps a weak reference)

    def write(self, data: str) -> None:
        soon(self.proc.stdin.write, data.encode())

    def resize(self, cols: int, rows: int) -> None:
        soon(self.proc.change_terminal_size, max(1, int(cols)), max(1, int(rows)))

    def close(self) -> None:
        soon(self.proc.close)


class AsyncSshMaster(SshMaster):
    def __init__(self, cfg: ClusterConfig, username: str, env: dict, log: Callable[[str], None],
                 ask: Callable[[str], str | None] | None = None):
        super().__init__(cfg, username, env, log)
        self.control_path = None  # nothing on disk: the login lives in this process
        self.ask = ask
        self._conn: asyncssh.SSHClientConnection | None = None
        self._lost = False
        self._bridge: asyncio.Server | None = None
        self._port = 0
        self._listeners: list = []

    def start(self, timeout: float = 180, cancelled: Callable[[], bool] = lambda: False) -> None:
        if self.alive():
            return
        self.stop()
        future = asyncio.run_coroutine_threadsafe(self._connect(timeout), loop())
        while not wait([future], 0.25).done:
            if cancelled():
                future.cancel()
                self.stop()
                raise SshError("Cancelled")
        try:
            future.result()
        except asyncssh.PermissionDenied:
            raise self._error(f"{self.username}@{self.cfg.host}: Permission denied ({AUTH}).")
        except asyncssh.HostKeyNotVerifiable:
            raise self._error(f"Host key verification failed: {self.cfg.host} is not the server it was before "
                              f"(its key differs from the one in {KNOWN_HOSTS})")
        except asyncssh.Error as e:
            raise self._error(e.reason or str(e) or "SSH login failed")
        except TimeoutError:
            raise self._error("SSH login timed out")
        except FileNotFoundError as e:
            raise self._error(f"Can't open {e.filename}: the file isn't there")
        except OSError as e:
            raise self._error(f"connect to host {self.cfg.host} port {self.cfg.port}: {e.strerror or e}")

    def _error(self, message: str) -> SshError:
        self.log(f"ssh: {message}")
        return SshError(message)

    async def _connect(self, timeout: float) -> None:
        KNOWN_HOSTS.parent.mkdir(parents=True, exist_ok=True)
        KNOWN_HOSTS.touch(exist_ok=True)
        self._lost = False
        keys = {"client_keys": [self.cfg.ssh_key]} if self.cfg.ssh_key else {}  # the key you picked
        if keys and not Path(self.cfg.ssh_key).is_file():  # moved or deleted since: sign in as if none was picked
            self.log(f"ssh: The key you picked, {self.cfg.ssh_key}, isn't there any more. Using your usual keys.")
            keys = {}
        local = tunnels.local_port(self.cfg.host, self.cfg.port)
        via = {"tunnel": _LocalPort(local)} if local else {}
        conn, _ = await asyncssh.create_connection(
            lambda: _Client(self), self.cfg.host, self.cfg.port, username=self.username,
            known_hosts=str(KNOWN_HOSTS), preferred_auth=AUTH, keepalive_interval=30, keepalive_count_max=3,
            connect_timeout=30, login_timeout=timeout, **{**keys, **via, **OPTIONS})
        try:
            self._bridge = await asyncio.start_server(self._serve_bridge, "127.0.0.1", 0)
        except OSError:
            conn.close()
            raise
        self._port = self._bridge.sockets[0].getsockname()[1]
        self._conn = conn

    def _log_lines(self, text: str) -> None:
        for line in text.splitlines():
            if line.strip():
                self.log(f"ssh: {line.rstrip()}")

    def _accept_new(self, host: str, addr: str, port: int, key: asyncssh.SSHKey) -> bool:
        """OpenSSH's StrictHostKeyChecking=accept-new: a new host is remembered, a changed key refused."""
        try:
            known = asyncssh.read_known_hosts(str(KNOWN_HOSTS)).match(host, addr, None if port == 22 else port)
        except (OSError, ValueError, asyncssh.Error):
            known = ((), ())
        if known[0] or known[1]:
            return False
        entry = host if port == 22 else f"[{host}]:{port}"
        kind, data = key.export_public_key().decode().split()[:2]
        try:
            with open(KNOWN_HOSTS, "a", encoding="utf-8") as fh:
                fh.write(f"{entry} {kind} {data}\n")
        except OSError:
            pass
        self.log(f"ssh: Warning: Permanently added '{entry}' ({kind}) to the list of known hosts.")
        return True

    def alive(self) -> bool:
        return self._conn is not None and not self._lost

    def stop(self) -> None:
        self.close_shells()
        conn, bridge, listeners = self._conn, self._bridge, self._listeners
        self._conn, self._bridge, self._listeners, self._port = None, None, [], 0
        if conn or bridge:
            try:
                call(self._shutdown(conn, bridge, listeners), 15)
            except Exception:  # noqa: BLE001 - it is going away either way
                pass

    @staticmethod
    async def _shutdown(conn, bridge, listeners) -> None:
        for listener in listeners:
            listener.close()
        if bridge:
            bridge.close()
        if conn:
            conn.close()
            await conn.wait_closed()

    def argv(self, command: str | None = None, tty: bool = False) -> list[str]:
        """A local command line for command on this connection: the bridge, or for a terminal the marker
        terminals.open_channel takes (no local program can ride this connection with a PTY)."""
        if tty:
            return [CHANNEL, self.cfg.id, command or ""]
        return ssh_bridge.argv(self._port, "exec", command or "")

    def copy_argv(self, src: str, dst: str) -> list[str]:
        """Like scp -r src dst (remote paths written as ':path'), over SFTP on this connection."""
        return ssh_bridge.argv(self._port, "copy", src, dst)

    def _new_shell(self, **kwargs) -> _SyncShell:
        return _SyncShell(self, **kwargs)

    def _run_plain(self, command: str, timeout: float) -> subprocess.CompletedProcess:
        conn = self._conn
        if conn is None or not self.alive():
            return subprocess.CompletedProcess(command, 255, "", "Not connected to the cluster")
        try:
            rc, out, err = call(self._exec(conn, command, timeout), timeout + 10)
        except TimeoutError:
            raise subprocess.TimeoutExpired(command, timeout)
        except (OSError, asyncssh.Error) as e:
            return subprocess.CompletedProcess(command, 255, "", f"connection to the cluster broke: {e}")
        return subprocess.CompletedProcess(command, rc, out.decode(errors="replace"), err.decode(errors="replace"))

    @staticmethod
    async def _exec(conn, command: str, timeout: float) -> tuple[int, bytes, bytes]:
        proc = await conn.create_process(command, encoding=None, stdin=asyncssh.DEVNULL)
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout)
        finally:
            proc.close()
        return (255 if proc.exit_status is None else proc.exit_status), out, err

    def forward(self, remote_host: str, remote_port: int) -> int:
        """Forward a free local port to remote_host:remote_port over the connection."""
        conn = self._conn
        if conn is None:
            raise SshError("Not connected to the cluster")
        try:
            listener = call(conn.forward_local_port("127.0.0.1", 0, remote_host, int(remote_port)), 30)
        except (OSError, asyncssh.Error, TimeoutError) as e:
            raise SshError(f"Port forward failed: {e}")
        self._listeners.append(listener)
        return listener.get_port()

    def open_channel(self, command: str, cols: int, rows: int, on_data: Callable[[bytes], None],
                     on_exit: Callable[[int], None]) -> Channel:
        """A PTY on the cluster running command (a login shell when empty). on_data and on_exit are called
        on the loop thread."""
        conn = self._conn
        if conn is None or not self.alive():
            raise SshError("Not connected to the cluster")
        return call(self._open_channel(conn, command, cols, rows, on_data, on_exit), 30)

    @staticmethod
    async def _open_channel(conn, command, cols, rows, on_data, on_exit) -> Channel:
        proc = await conn.create_process(*([command] if command else []), encoding=None, stderr=asyncssh.STDOUT,
                                         term_type="xterm-256color", term_size=(max(1, cols), max(1, rows)))

        async def pump():
            try:
                while data := await proc.stdout.read(65536):
                    on_data(data)
                await proc.wait_closed()
            except (OSError, asyncssh.Error):
                pass
            on_exit(255 if proc.exit_status is None else proc.exit_status)

        channel = Channel(proc)
        channel.task = asyncio.get_running_loop().create_task(pump())
        return channel

    async def _serve_bridge(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            header = json.loads(await asyncio.wait_for(reader.readline(), 10))
            if not hmac.compare_digest(str(header.get("token", "")), TOKEN):
                return
            op, args, conn = header.get("op"), [str(a) for a in header.get("args") or []], self._conn
            if conn is None:
                writer.write(ssh_bridge.frame(b"e", b"Not connected to the cluster\n"))
                rc = 255
            elif op == "exec" and len(args) == 1:
                rc = await self._bridge_exec(conn, args[0], reader, writer)
            elif op == "copy" and len(args) == 2:
                rc = await self._bridge_copy(conn, args[0], args[1], writer)
            else:
                writer.write(ssh_bridge.frame(b"e", f"Unknown request {op}\n".encode()))
                rc = 2
            writer.write(ssh_bridge.frame(b"x", str(rc).encode()))
            await writer.drain()
        except (OSError, ValueError, TimeoutError, asyncssh.Error, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()

    @staticmethod
    async def _bridge_exec(conn, command: str, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> int:
        try:
            proc = await conn.create_process(*([command] if command else []), encoding=None)
        except (OSError, asyncssh.Error) as e:
            writer.write(ssh_bridge.frame(b"e", f"connection to the cluster broke: {e}\n".encode()))
            return 255

        async def feed():  # stdin from the local process; its socket closing means it was stopped
            try:
                while True:
                    kind, size = ssh_bridge.HEAD.unpack(await reader.readexactly(ssh_bridge.HEAD.size))
                    data = await reader.readexactly(size)
                    try:
                        if kind == b"i":
                            proc.stdin.write(data)
                            await proc.stdin.drain()
                        elif kind == b"c":
                            proc.stdin.write_eof()
                    except (OSError, asyncssh.Error):
                        pass  # the command stopped reading
            except (OSError, asyncio.IncompleteReadError):
                proc.close()

        async def pump(stream, kind: bytes):
            while data := await stream.read(65536):
                writer.write(ssh_bridge.frame(kind, data))
                await writer.drain()

        feeder = asyncio.get_running_loop().create_task(feed())
        try:
            await asyncio.gather(pump(proc.stdout, b"o"), pump(proc.stderr, b"e"))
            await proc.wait_closed()
        except (OSError, asyncssh.Error):
            proc.close()
        finally:
            feeder.cancel()
        return 255 if proc.exit_status is None else proc.exit_status

    @staticmethod
    async def _bridge_copy(conn, src: str, dst: str, writer: asyncio.StreamWriter) -> int:
        def remote(path: str) -> str:
            path = path[1:]
            return "." if path in ("", "~") else path[2:] if path.startswith("~/") else path

        try:
            async with conn.start_sftp_client() as sftp:
                if src.startswith(":") and not dst.startswith(":"):
                    await sftp.get(remote(src), dst, recurse=True, follow_symlinks=True)
                elif dst.startswith(":") and not src.startswith(":"):
                    await sftp.put(src, remote(dst), recurse=True, follow_symlinks=True)
                else:
                    raise ValueError("copy one local and one remote path")
        except (OSError, ValueError, asyncssh.Error) as e:
            writer.write(ssh_bridge.frame(b"e", f"{e}\n".encode()))
            return 1
        return 0
