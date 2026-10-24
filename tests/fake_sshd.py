"""An SSH server inside the test process (asyncssh) standing in for a cluster: a password and a Duo-style menu
over keyboard-interactive (or plain password auth), commands run by the local bash, SFTP on the local disk, port
forwarding, and PTYs that answer what they were opened with. Paths over SFTP are inside root."""

import asyncio
import shutil
import sys
from pathlib import Path

import asyncssh

from hpc_hub.core import ssh_async

WIN_BASH = Path(r"C:\Program Files\Git\bin\bash.exe")  # not System32's bash.exe, which starts WSL
BASH = str(WIN_BASH) if sys.platform == "win32" and WIN_BASH.exists() else shutil.which("bash")
PASSWORD = "pw"
DUO = ("Duo two-factor login for u\n\nEnter a passcode or select one of the following options:\n\n"
       " 1. Duo Push to XXX-XXX-1234\n 2. Phone call to XXX-XXX-1234\n\nPasscode or option (1-2): ")


class _Server(asyncssh.SSHServer):
    def __init__(self, sshd: "FakeSshd"):
        self.sshd = sshd
        self.step = 0

    def begin_auth(self, username: str) -> bool:
        return True

    def password_auth_supported(self) -> bool:
        return self.sshd.mode == "password"

    def validate_password(self, username: str, password: str) -> bool:
        return password == PASSWORD

    def kbdint_auth_supported(self) -> bool:
        return self.sshd.mode == "duo"

    def get_kbdint_challenge(self, username, lang, submethods):
        self.step = 0
        return "", "", "", [("Password: ", False)]

    def validate_kbdint_response(self, username, responses):
        if self.step == 0:
            if list(responses) != [PASSWORD]:
                return False
            self.step = 1
            return "", "", "", [(DUO, False)]
        self.sshd.duo.append(list(responses))
        return list(responses) == ["1"]

    def connection_requested(self, dest_host, dest_port, orig_host, orig_port) -> bool:
        return True


class FakeSshd:
    def __init__(self, root: Path, mode: str = "duo"):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.mode = mode  # "duo": password then Duo over keyboard-interactive; "password": password auth
        self.duo: list[list[str]] = []  # what was answered to the Duo menu
        self.key = asyncssh.generate_private_key("ssh-ed25519")
        self.server = None
        self.port = 0

    def start(self) -> None:
        self.server = ssh_async.call(asyncssh.create_server(
            lambda: _Server(self), "127.0.0.1", 0, server_host_keys=[self.key], process_factory=self._handle,
            sftp_factory=lambda chan: asyncssh.SFTPServer(chan, chroot=str(self.root)), allow_pty=True,
            encoding=None), 30)
        self.port = self.server.sockets[0].getsockname()[1]

    def stop(self) -> None:
        if self.server:
            ssh_async.soon(self.server.close)

    async def _handle(self, process: asyncssh.SSHServerProcess) -> None:
        if process.get_terminal_type():
            return await self._pty(process)
        local = await asyncio.create_subprocess_exec(
            BASH, "-c", process.command or "exec bash", stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)

        async def feed():
            try:
                while data := await process.stdin.read(65536):
                    local.stdin.write(data)
                    await local.stdin.drain()
            except (OSError, asyncssh.Error):
                pass
            finally:
                local.stdin.close()

        async def pump(src, dst):
            while data := await src.read(65536):
                dst.write(data)

        feeder = asyncio.get_running_loop().create_task(feed())
        await asyncio.gather(pump(local.stdout, process.stdout), pump(local.stderr, process.stderr))
        rc = await local.wait()
        feeder.cancel()
        process.exit(rc)

    @staticmethod
    async def _pty(process: asyncssh.SSHServerProcess) -> None:
        width, height, *_ = process.get_terminal_size()
        process.stdout.write(f"pty {process.get_terminal_type()} {width}x{height} {process.command}\r\n".encode())
        while True:
            try:
                data = await process.stdin.read(1024)
            except asyncssh.TerminalSizeChanged as e:
                process.stdout.write(f"size {e.width}x{e.height}\r\n".encode())
                continue
            if not data or b"exit" in data:
                break
            process.stdout.write(b"echo " + data)
        process.exit(3)
