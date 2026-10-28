"""VPN web sign-in in real Chrome with a profile of HPC Hub's own, watched over the DevTools protocol, so the
sign-in is picked up the moment the gateway sets its token cookie (a Chrome profile's cookie file lags ~30 s).

Chrome 136+ refuses remote debugging on its default user data dir, hence a folder of ours (web_dir()/chrome).
Its cookies stay, so Okta remembers you after the first time. The protocol runs over fds 3 and 4
(--remote-debugging-pipe) as NUL-terminated JSON, so no websocket is needed.
"""

import json
import os
import select
import shutil
import signal
import time
import urllib.parse
from collections.abc import Callable, Sequence
from pathlib import Path

from ..core import browser, paths
from .vpn_sso import SsoStart

CHOICE = "hpc-hub:chrome-window"  # vpn.browser for this window; the ":" keeps it apart from profile names
TITLE = "HPC Hub Chrome window (fastest)"
SUBTITLE = "Real Chrome with its own profile. Done the moment you approve Duo."
POLL = 0.5
CLOSE_WAIT = 5.0


class ChromeError(Exception):
    pass


class Closed(ChromeError):
    """Chrome went away (you closed the window)."""


def available() -> bool:
    """Chrome is installed, on a system where we can hand it fds 3 and 4."""
    return hasattr(os, "posix_spawn") and bool(browser.chrome())


def profile_dir() -> Path:
    path = paths.web_dir() / "chrome"
    path.mkdir(mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def _matches(domain: str, host: str) -> bool:
    domain = domain.lower()
    return domain == host or (domain.startswith(".") and (host == domain[1:] or host.endswith(domain)))


class Window:
    """One Chrome process on our profile, driven over the pipe. Events from Chrome are read and dropped."""

    def __init__(self, binary: str, folder: Path, args: Sequence[str] = ()):
        to_chrome, from_chrome = os.pipe(), os.pipe()
        # moved above 9 first, so dup2 onto 3 and 4 can't overwrite each other; CLOEXEC leaves only 3 and 4 open
        ends = [_high(fd) for fd in (to_chrome[0], from_chrome[1])]
        for fd in (to_chrome[0], from_chrome[1]):
            os.close(fd)
        self.w, self.r, self.buf, self.last = to_chrome[1], from_chrome[0], b"", 0
        argv = [binary, f"--user-data-dir={folder}", "--remote-debugging-pipe", "--no-first-run",
                "--no-default-browser-check", *args, "about:blank"]
        try:
            self.pid: int | None = os.posix_spawn(binary, argv, os.environ, setsid=True, file_actions=[
                (os.POSIX_SPAWN_DUP2, ends[0], 3), (os.POSIX_SPAWN_DUP2, ends[1], 4),
                (os.POSIX_SPAWN_OPEN, 0, os.devnull, os.O_RDONLY, 0),
                (os.POSIX_SPAWN_OPEN, 1, os.devnull, os.O_WRONLY, 0),
                (os.POSIX_SPAWN_OPEN, 2, os.devnull, os.O_WRONLY, 0)])
        except OSError:
            self.pid = None
            os.close(self.w)
            os.close(self.r)
            raise
        finally:
            for fd in ends:
                os.close(fd)

    def call(self, method: str, params: dict | None = None, timeout: float = 15) -> dict:
        self.last += 1
        want = self.last
        data = json.dumps({"id": want, "method": method, "params": params or {}}).encode() + b"\0"
        try:
            while data:
                data = data[os.write(self.w, data):]
        except OSError as e:
            raise Closed("Chrome closed") from e
        end = time.monotonic() + timeout
        while True:
            for msg in self._messages():
                if msg.get("id") == want:
                    if "error" in msg:
                        raise ChromeError(f"{method}: {msg['error'].get('message', msg['error'])}")
                    return msg.get("result") or {}
            if time.monotonic() >= end:
                raise ChromeError(f"Chrome did not answer {method}")
            self.pump(end - time.monotonic())

    def pump(self, seconds: float) -> None:
        """Wait up to `seconds` for data from Chrome; raises Closed if it has gone."""
        ready, _, _ = select.select([self.r], [], [], max(seconds, 0))
        if ready:
            chunk = os.read(self.r, 1 << 16)
            if not chunk:
                raise Closed("Chrome closed")
            self.buf += chunk

    def _messages(self):
        while b"\0" in self.buf:
            raw, self.buf = self.buf.split(b"\0", 1)
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict):
                yield msg

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
        if self.pid is None:
            return
        try:
            self.call("Browser.close", timeout=CLOSE_WAIT)
        except ChromeError:
            pass
        if not self._reaped(CLOSE_WAIT):
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(self.pid, sig)
                except OSError:
                    pass
                if self._reaped(CLOSE_WAIT):
                    break
        self.pid = None
        os.close(self.w)
        os.close(self.r)

    def _reaped(self, seconds: float) -> bool:
        end = time.monotonic() + seconds
        while True:
            try:
                done, _ = os.waitpid(self.pid, os.WNOHANG)
            except ChildProcessError:
                return True
            if done or time.monotonic() >= end:
                return bool(done)
            time.sleep(0.05)


def _high(fd: int) -> int:
    import fcntl  # Unix only, like posix_spawn
    return fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 10)


def sign_in(start: SsoStart, cancelled: Callable[[], bool], timeout: float = 600, binary: str = "",
            folder: Path | None = None, args: Sequence[str] = ()) -> tuple[str, str]:
    """Blocking: open the sign-in page in our Chrome window and wait for the token cookie. (token, error); the
    window is closed either way. A token or error cookie left from an earlier sign-in doesn't count."""
    binary = binary or shutil.which(browser.chrome() or "") or ""
    if not binary:
        return "", "Google Chrome is not installed"
    host = (urllib.parse.urlsplit(start.final_url or start.login_url).hostname or "").lower()
    try:
        win = Window(binary, folder or profile_dir(), args)
    except OSError as e:
        return "", f"Could not start Chrome: {e}"
    try:
        try:
            old = win.cookies(host)
        except Closed:  # Chrome handed the page to a window of ours that is still open, and quit
            return "", "The HPC Hub Chrome window is open already. Close it and try again."
        win.open(start.login_url)
        end = time.monotonic() + timeout
        while not cancelled() and time.monotonic() < end:
            jar = win.cookies(host)
            token, err = jar.get(start.token_cookie, ""), jar.get(start.error_cookie, "")
            if token and token != old.get(start.token_cookie):
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
