"""Web sign-in (the VPN, a cluster's portal) in real Chrome with a profile of HPC Hub's own, watched over the
DevTools protocol, so the sign-in is picked up the moment the site sets its token cookie. Never your own Chrome
profile: only this window's cookies are read.

Chrome 136+ refuses remote debugging on its default user data dir, hence a folder of ours (web_dir()/chrome).
Its cookies stay, so Okta remembers you after the first time. On Linux and macOS the protocol runs over fds 3 and
4 (--remote-debugging-pipe) as NUL-terminated JSON. Windows can't hand Chrome those fds, so there Chrome listens on
a random port on 127.0.0.1 (--remote-debugging-port=0, written to DevToolsActivePort in our folder) and we talk
to it over a websocket; the port lives only as long as the sign-in window.
"""

import json
import os
import select
import shutil
import signal
import subprocess
import sys
import time
import urllib.parse
from collections.abc import Callable, Sequence
from pathlib import Path

from ..core import browser, paths
from ..core.config import CHROME_WINDOW
from ..core.websocket import Closed as SocketClosed
from ..core.websocket import WebSocket
from .vpn_sso import SsoStart

CHOICE = CHROME_WINDOW  # vpn.browser for this window
TITLE = "HPC Hub Chrome window (fastest)"
SUBTITLE = "Real Chrome with its own profile. Done the moment you approve Duo."
POLL = 0.5
CLOSE_WAIT = 5.0
START_WAIT = 20.0  # seconds for Chrome to write DevToolsActivePort
PORT = sys.platform == "win32"  # the DevTools port instead of the pipe
PORT_FILE = "DevToolsActivePort"


class ChromeError(Exception):
    pass


class Closed(ChromeError):
    """Chrome went away (you closed the window)."""


def available() -> bool:
    """Chrome is installed, and we can talk to it here: the pipe (posix_spawn) or, on Windows, the port."""
    return (PORT or hasattr(os, "posix_spawn")) and bool(browser.chrome())


def profile_dir() -> Path:
    path = paths.web_dir() / "chrome"
    path.mkdir(mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def _matches(domain: str, host: str) -> bool:
    domain = domain.lower()
    return domain == host or (domain.startswith(".") and (host == domain[1:] or host.endswith(domain)))


def read_port_file(path: Path) -> tuple[int, str] | None:
    """(port, browser websocket path) from Chrome's DevToolsActivePort, or None until it is written."""
    try:
        port, ws_path = path.read_text().split("\n")[:2]
        return int(port), ws_path.strip()
    except (OSError, ValueError):
        return None


def _decoded(raw: list[bytes]) -> list[dict]:
    out = []
    for r in raw:
        try:
            msg = json.loads(r)
        except ValueError:
            continue
        if isinstance(msg, dict):
            out.append(msg)
    return out


class _Pipe:
    """Chrome spawned with our pipe on its fds 3 and 4 (Linux, macOS)."""

    def __init__(self, command: Sequence[str], folder: Path, flags: Sequence[str]):
        to_chrome, from_chrome = os.pipe(), os.pipe()
        # moved above 9 first, so dup2 onto 3 and 4 can't overwrite each other; CLOEXEC leaves only 3 and 4 open
        ends = [_high(fd) for fd in (to_chrome[0], from_chrome[1])]
        for fd in (to_chrome[0], from_chrome[1]):
            os.close(fd)
        self.w, self.r, self.buf = to_chrome[1], from_chrome[0], b""
        argv = [*command, f"--user-data-dir={folder}", "--remote-debugging-pipe", *flags]
        try:
            self.pid = os.posix_spawn(command[0], argv, os.environ, setsid=True, file_actions=[
                (os.POSIX_SPAWN_DUP2, ends[0], 3), (os.POSIX_SPAWN_DUP2, ends[1], 4),
                (os.POSIX_SPAWN_OPEN, 0, os.devnull, os.O_RDONLY, 0),
                (os.POSIX_SPAWN_OPEN, 1, os.devnull, os.O_WRONLY, 0),
                (os.POSIX_SPAWN_OPEN, 2, os.devnull, os.O_WRONLY, 0)])
        except OSError:
            os.close(self.w)
            os.close(self.r)
            raise
        finally:
            for fd in ends:
                os.close(fd)

    def send(self, msg: dict) -> None:
        data = json.dumps(msg).encode() + b"\0"
        try:
            while data:
                data = data[os.write(self.w, data):]
        except OSError as e:
            raise Closed("Chrome closed") from e

    def receive(self, seconds: float) -> list[dict]:
        ready, _, _ = select.select([self.r], [], [], max(seconds, 0))
        if ready:
            chunk = os.read(self.r, 1 << 16)
            if not chunk:
                raise Closed("Chrome closed")
            self.buf += chunk
        *whole, self.buf = self.buf.split(b"\0")
        return _decoded(whole)

    def reaped(self, seconds: float) -> bool:
        end = time.monotonic() + seconds
        while True:
            try:
                done, _ = os.waitpid(self.pid, os.WNOHANG)
            except ChildProcessError:
                return True
            if done or time.monotonic() >= end:
                return bool(done)
            time.sleep(0.05)

    def kill(self, hard: bool) -> None:
        try:
            os.killpg(self.pid, signal.SIGKILL if hard else signal.SIGTERM)
        except OSError:
            pass

    def release(self) -> None:
        os.close(self.w)
        os.close(self.r)


class _Port:
    """Chrome listening on a random port on 127.0.0.1, reached over a websocket (Windows). Only DevToolsActivePort
    in our own folder says where, and the port closes with the window."""

    def __init__(self, command: Sequence[str], folder: Path, flags: Sequence[str]):
        port_file = Path(folder) / PORT_FILE
        port_file.unlink(missing_ok=True)  # left by a window that crashed: not this Chrome's port
        argv = [*command, f"--user-data-dir={folder}", "--remote-debugging-port=0", *flags]
        self.ws: WebSocket | None = None
        self.proc = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL, start_new_session=os.name == "posix")
        end = time.monotonic() + START_WAIT
        while (found := read_port_file(port_file)) is None:
            if self.proc.poll() is not None:  # handed the page to a window of ours that is open, and quit
                raise Closed("Chrome closed")
            if time.monotonic() >= end:
                self.kill(True)
                raise ChromeError("Chrome did not open its DevTools port")
            time.sleep(0.05)
        try:
            self.ws = WebSocket("127.0.0.1", *found)
        except OSError as e:
            self.kill(True)
            raise ChromeError(f"Could not reach Chrome: {e}") from e

    def send(self, msg: dict) -> None:
        try:
            self.ws.send(json.dumps(msg))
        except OSError as e:
            raise Closed("Chrome closed") from e

    def receive(self, seconds: float) -> list[dict]:
        try:
            text = self.ws.recv(seconds)
        except (SocketClosed, OSError) as e:
            raise Closed("Chrome closed") from e
        return _decoded([text.encode()] if text is not None else [])

    def reaped(self, seconds: float) -> bool:
        try:
            self.proc.wait(seconds)
            return True
        except subprocess.TimeoutExpired:
            return False

    def kill(self, hard: bool) -> None:
        try:
            if hard:
                self.proc.kill()
            else:
                self.proc.terminate()
        except OSError:
            pass

    def release(self) -> None:
        if self.ws:
            self.ws.close()


class Window:
    """One Chrome process on our profile, driven over the DevTools protocol. Events from Chrome are dropped.
    binary: Chrome's program, or a command (a list) that starts it."""

    def __init__(self, binary: str | Sequence[str], folder: Path, args: Sequence[str] = ()):
        command = [binary] if isinstance(binary, str) else list(binary)
        flags = ["--no-first-run", "--no-default-browser-check", *args, "about:blank"]
        self.link = (_Port if PORT else _Pipe)(command, folder, flags)
        self.inbox: list[dict] = []
        self.last, self.running = 0, True

    def call(self, method: str, params: dict | None = None, timeout: float = 15) -> dict:
        self.last += 1
        want = self.last
        self.link.send({"id": want, "method": method, "params": params or {}})
        end = time.monotonic() + timeout
        while True:
            for msg in self.inbox:
                if msg.get("id") == want:
                    self.inbox.remove(msg)
                    if "error" in msg:
                        raise ChromeError(f"{method}: {msg['error'].get('message', msg['error'])}")
                    return msg.get("result") or {}
            self.inbox = [m for m in self.inbox if "id" in m]  # events: nobody waits for them
            if time.monotonic() >= end:
                raise ChromeError(f"Chrome did not answer {method}")
            self.pump(end - time.monotonic())

    def pump(self, seconds: float) -> None:
        """Wait up to `seconds` for data from Chrome; raises Closed if it has gone."""
        self.inbox += self.link.receive(seconds)

    def cookies(self, host: str) -> dict[str, str]:
        jar = self.call("Storage.getCookies").get("cookies", [])
        return {c["name"]: c.get("value", "") for c in jar if _matches(c.get("domain", ""), host)}

    def open(self, url: str) -> None:
        """Show url in a new tab and close the blank one Chrome started with."""
        old = [t["targetId"] for t in self.call("Target.getTargets").get("targetInfos", []) if t.get("type") == "page"]
        self.call("Target.createTarget", {"url": url})
        for target in old:
            try:
                self.call("Target.closeTarget", {"targetId": target})
            except ChromeError:
                pass

    def close(self) -> None:
        if not self.running:
            return
        self.running = False
        try:
            self.call("Browser.close", timeout=CLOSE_WAIT)
        except ChromeError:
            pass
        if not self.link.reaped(CLOSE_WAIT):
            for hard in (False, True):
                self.link.kill(hard)
                if self.link.reaped(CLOSE_WAIT):
                    break
        self.link.release()


def _high(fd: int) -> int:
    import fcntl  # Unix only, like posix_spawn
    return fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 10)


def sign_in(start: SsoStart, cancelled: Callable[[], bool], timeout: float = 600,
            binary: str | Sequence[str] = "", folder: Path | None = None, args: Sequence[str] = ()) -> tuple[str, str]:
    """Blocking: open the sign-in page in our Chrome window and wait for the token cookie. (token, error); the
    window is closed either way. A token or error cookie left from an earlier sign-in doesn't count, unless
    start.reuse (a portal session that may still be good)."""
    binary = binary or shutil.which(browser.chrome() or "") or ""
    if not binary:
        return "", "Google Chrome is not installed"
    host = (urllib.parse.urlsplit(start.final_url or start.login_url).hostname or "").lower()
    open_already = "The HPC Hub Chrome window is open already. Close it and try again."
    try:
        win = Window(binary, folder or profile_dir(), args)
    except Closed:  # Chrome handed the page to a window of ours that is still open, and quit
        return "", open_already
    except (OSError, ChromeError) as e:
        return "", f"Could not start Chrome: {e}"
    try:
        try:
            old = win.cookies(host)
        except Closed:
            return "", open_already
        win.open(start.login_url)
        end = time.monotonic() + timeout
        while not cancelled() and time.monotonic() < end:
            jar = win.cookies(host)
            token, err = jar.get(start.token_cookie, ""), jar.get(start.error_cookie, "")
            if token and (start.reuse or token != old.get(start.token_cookie)):
                return token, ""
            if err and err != old.get(start.error_cookie):
                return "", urllib.parse.unquote(err)
            pause = time.monotonic() + POLL
            while time.monotonic() < pause:
                win.pump(pause - time.monotonic())
        return "", "Sign-in cancelled"
    except Closed:
        return "", "The Chrome window was closed"
    except (ChromeError, OSError) as e:
        return "", f"Chrome: {e}"
    finally:
        win.close()
