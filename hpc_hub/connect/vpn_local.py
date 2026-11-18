"""The VPN without administrator (Windows), as on the phone (vpn_android): openconnect runs as you and hands the
tunnel to hpc-hub-vpn-tunnel (app/vpn-helper/src/tunnel_proxy), which forwards a local port to the cluster's SSH
port with a TCP/IP stack of its own. Nothing is installed and the computer's network is untouched, so only HPC
Hub's own connections use the VPN.

Used when this Windows account isn't an administrator (the helper's prompt would ask for an administrator's
password), or when you chose it: Settings > VPN without administrator, or Not now at the helper's prompt.

openconnect for Windows learned --script-tun from packaging/vpn/openconnect-windows-script-tun.patch: the tunnel
is a named pipe (VPNPIPE). When the forwarder closes it, openconnect logs out of the VPN and exits, so that is
how it is stopped."""

import os
import shlex
import signal
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from ..core import config
from ..core.config import ClusterConfig
from ..core.paths import WINDOWS, runtime_dir
from . import vpn_android, vpn_helper
from .vpn import VpnError

TUNNEL = "hpc-hub-vpn-tunnel.exe" if WINDOWS else "hpc-hub-vpn-tunnel"
OPENCONNECT = "openconnect.exe" if WINDOWS else "openconnect"
NO_LOCAL = "This HPC Hub has no VPN without administrator yet. Update it, or set up the VPN helper."
ONLY_HPC_HUB = ("HPC Hub's own VPN only carries HPC Hub's connections, so VPN only has nothing to do. For your "
                "other programs, use the VPN helper (Settings: turn off VPN without administrator).")
CREATE_NEW_PROCESS_GROUP = 0x0000_0200
CREATE_NO_WINDOW = 0x0800_0000


def programs() -> tuple[Path, Path] | None:
    """The shipped openconnect and forwarder (HPC_HUB_VPN_DIR: tests), or None when this copy has none."""
    if os.environ.get("HPC_HUB_VPN_DIR"):
        here = Path(os.environ["HPC_HUB_VPN_DIR"])
        oc, tunnel = here / OPENCONNECT, here / TUNNEL
    else:
        try:
            folder = vpn_helper.bundle()
        except VpnError:
            return None
        oc, tunnel = folder / "openconnect" / OPENCONNECT, folder / TUNNEL
    return (oc, tunnel) if oc.is_file() and tunnel.is_file() else None


def chosen() -> bool:
    """Settings > VPN without administrator."""
    try:
        return config.load_app(config.APP_FILE).own_vpn
    except (OSError, ValueError):
        return False


def choose() -> None:
    """You said Not now to the helper: HPC Hub's own VPN from now on (Settings turns it off again)."""
    app = config.load_app(config.APP_FILE)
    app.own_vpn = True
    config.save_app(app, config.APP_FILE)


def used(cfg: ClusterConfig) -> bool:
    """Is this the VPN for cfg? Windows only, when this HPC Hub has it, and when you chose it or the account
    can't install the helper (and nobody installed it for you)."""
    if not WINDOWS or not cfg.vpn.enabled or programs() is None:
        return False
    if chosen():
        return True
    return vpn_helper.standard_user() and vpn_helper.installed_version() != vpn_helper.VERSION


# -- processes, on Windows by their program's name --------------------------------------------------------

def image(pid: int) -> str:
    """The file name of the program running as pid ("" if none, or it ended)."""
    if not WINDOWS:
        try:
            return Path(os.readlink(f"/proc/{pid}/exe")).name
        except OSError:
            return ""
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.windll.kernel32
    handle = kernel.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return ""
    try:
        code = wintypes.DWORD()
        if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value != 259:  # STILL_ACTIVE
            return ""
        size = wintypes.DWORD(1024)
        buf = ctypes.create_unicode_buffer(size.value)
        if not kernel.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return ""
        return Path(buf.value).name
    finally:
        kernel.CloseHandle(handle)


def end(pid: int) -> None:
    """Stop pid now (TerminateProcess on Windows)."""
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass


def _ours(pid: int, name: str) -> bool:
    return image(pid).lower() == name.lower()


class LocalVpn(vpn_android.AndroidVpn):
    """openconnect and hpc-hub-vpn-tunnel, both as you. Sign-in as with the helper: the shipped openconnect, the
    app's own page for web sign-in."""

    def __init__(self, cfg: ClusterConfig, log: Callable[[str], None]):
        super().__init__(cfg, log)
        found = programs()
        self.openconnect, self.ocproxy = (str(found[0]), str(found[1])) if found else ("openconnect", TUNNEL)
        self.external_browser = ""
        self.extra_args = []

    def ensure_profile(self) -> None:
        if not self.cfg.vpn.gateway:
            raise VpnError("The VPN address is empty. Set it in this cluster's Settings, under Advanced.")
        if programs() is None:
            raise VpnError(NO_LOCAL)

    def _pid_file(self) -> Path:
        return runtime_dir() / f"vpn-{self.cfg.id}.tunnel.pid"

    def script(self, port: int) -> str:
        """Windows: openconnect starts it as a program (no shell), so Windows quoting."""
        argv = [self.ocproxy, *vpn_android.forward_args(self.cfg, port), "--pid-file", str(self._pid_file())]
        return subprocess.list2cmdline(argv) if WINDOWS else shlex.join(argv)

    def _spawn(self, argv: list[str]) -> subprocess.Popen:
        if WINDOWS:
            return subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                    creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        return super()._spawn(argv)

    def _running(self, pid: int) -> bool:
        return _ours(pid, Path(self.openconnect).name)

    def _stop(self, pid: int, proc: subprocess.Popen | None) -> None:
        """Windows: end the forwarder, so openconnect logs out and exits by itself; end openconnect after 5 s if
        it hasn't. Elsewhere SIGTERM does the same (openconnect logs out, and hangs up on the forwarder)."""
        pid_file = self._pid_file()
        if not WINDOWS:
            vpn_android.stop(pid, proc)
        else:
            try:
                tunnel = int(pid_file.read_text().strip())
            except (OSError, ValueError):
                tunnel = 0
            if tunnel and _ours(tunnel, TUNNEL):
                end(tunnel)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and (proc.poll() is None if proc else self._running(pid)):
                time.sleep(0.1)
            if proc.poll() is None if proc else self._running(pid):
                end(pid)
        try:
            pid_file.unlink()
        except OSError:
            pass


def is_local(vpn: object) -> bool:
    return isinstance(vpn, LocalVpn)

