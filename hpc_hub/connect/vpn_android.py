"""VPN on Android: openconnect and ocproxy (mobile/vpn/build.sh), run as programs from the app's native libraries.

No VpnService and no system-wide VPN. openconnect hands the tunnel to ocproxy (--script-tun), a TCP/IP stack in
userspace that forwards a local port to the cluster's SSH port, and SSH dials that port (core/tunnels.py). So only
HPC Hub's own SSH goes through it, and Wulver and Yale can be up at once, each with its own port. Signing in is the
laptop's: openconnect --authenticate, or the web sign-in (vpn_sso) for SAML gateways; the cookie goes to the
tunnel on stdin. Each tunnel is noted in the runtime folder, so a restarted backend finds it again.
"""

import atexit
import json
import os
import shlex
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path

from ..core import tunnels
from ..core.config import ClusterConfig
from ..core.paths import runtime_dir
from .vpn import Vpn, VpnError, nm_secrets

OPENCONNECT = "libhpchub_openconnect.so"
OCPROXY = "libhpchub_ocproxy.so"
UP_TIMEOUT = 60  # seconds from starting openconnect to the cluster answering through it
KEEPALIVE = 30  # ocproxy's TCP keepalive, seconds
NO_VPN = "This copy of HPC Hub has no VPN. Use campus Wi-Fi, then connect again."

_started: dict[str, subprocess.Popen] = {}  # cluster id -> openconnect, started by this backend
_lock = threading.Lock()


def programs_dir() -> Path:
    """The native libraries folder, where the backend's launcher is (HPC_HUB_VPN_DIR: tests)."""
    if os.environ.get("HPC_HUB_VPN_DIR"):
        return Path(os.environ["HPC_HUB_VPN_DIR"])
    return Path(os.environ.get("HPC_HUB_LAUNCHER") or sys.executable).parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _state_file(cluster: str) -> Path:
    return runtime_dir() / f"vpn-{cluster}.json"


def _read_state(cluster: str) -> dict | None:
    try:
        state = json.loads(_state_file(cluster).read_text())
        return state if isinstance(state.get("pid"), int) and isinstance(state.get("port"), int) else None
    except (OSError, ValueError, AttributeError):
        return None


def _is_openconnect(pid: int) -> bool:
    """pid is a running openconnect of ours (not a pid reused since, and not a zombie: its cmdline is empty)."""
    try:
        return OPENCONNECT.encode() in Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        return False


def ssh_answers(port: int, timeout: float = 5) -> bool:
    """The cluster's SSH server greets through the tunnel ("SSH-2.0-..."): the tunnel works end to end."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout) as s:
            return s.recv(64).startswith(b"SSH-")
    except OSError:
        return False


def tunnel_argv(cfg: ClusterConfig, auth: dict[str, str], openconnect: str, ocproxy: str, port: int,
                extra: list[str]) -> list[str]:
    """openconnect with the sign-in's cookie (on stdin) and server pin, the tunnel going to ocproxy, which
    forwards 127.0.0.1:port to the cluster's SSH port."""
    v = cfg.vpn
    secrets = nm_secrets(auth, v.gateway)
    url = secrets["gateway"] if "://" in secrets["gateway"] else f"https://{secrets['gateway']}"
    script = shlex.join([ocproxy, "-L", f"{port}:{cfg.host}:{cfg.port}", "-k", str(KEEPALIVE)])
    argv = [openconnect, "--protocol", v.protocol, "--cookie-on-stdin", "--non-inter", "--script-tun",
            "--script", script, *extra]
    if secrets["gwcert"]:
        argv += ["--servercert", secrets["gwcert"]]
    if secrets["resolve"]:
        argv += ["--resolve", secrets["resolve"]]
    if v.useragent:
        argv += ["--useragent", v.useragent]
    return [*argv, url]


class AndroidVpn(Vpn):
    def __init__(self, cfg: ClusterConfig, log: Callable[[str], None]):
        super().__init__(cfg, log)
        here = programs_dir()
        self.openconnect = str(here / OPENCONNECT)
        self.ocproxy = str(here / OCPROXY)
        self.external_browser = ""  # SAML gateways: the app's sign-in page (vpn_sso), as on Windows and macOS
        cafile = os.environ.get("SSL_CERT_FILE")  # the phone's certificate authorities (PythonSetup.kt)
        if cafile and os.path.isfile(cafile):
            self.extra_args = ["--cafile", cafile]

    def ensure_profile(self) -> None:
        if not self.cfg.vpn.gateway:
            raise VpnError("The VPN address is empty. Set it in this cluster's Settings, under Advanced.")
        if not (os.access(self.openconnect, os.X_OK) and os.access(self.ocproxy, os.X_OK)):
            raise VpnError(NO_VPN)

    def is_active(self) -> bool:
        state = _read_state(self.cfg.id)
        if state and _is_openconnect(state["pid"]):
            tunnels.use(self.cfg.host, self.cfg.port, state["port"])
            return True
        tunnels.drop(self.cfg.host, self.cfg.port)
        return False

    def up(self, auth: dict[str, str]) -> None:
        self.down()  # one left from before (a stale note, or a tunnel that lost its sign-in)
        port = free_port()
        argv = tunnel_argv(self.cfg, auth, self.openconnect, self.ocproxy, port, self.extra_args)
        try:
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                    start_new_session=True)
        except OSError as e:
            raise VpnError(f"Could not start the VPN: {e}") from e
        last: list[str] = []
        threading.Thread(target=self._pump, args=(proc, last), daemon=True).start()
        try:
            proc.stdin.write((auth["COOKIE"] + "\n").encode())
            proc.stdin.close()
        except OSError:
            pass  # it stopped already; the wait below says why
        with _lock:
            _started[self.cfg.id] = proc
        _state_file(self.cfg.id).write_text(json.dumps({"pid": proc.pid, "port": port}))
        deadline = time.monotonic() + UP_TIMEOUT
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                self.down()
                time.sleep(0.2)  # its last words
                why = last[-1] if last else f"openconnect stopped ({proc.returncode})"
                raise VpnError(f"VPN tunnel did not come up: {why}")
            if ssh_answers(port, timeout=min(5, max(1, deadline - time.monotonic()))):
                tunnels.use(self.cfg.host, self.cfg.port, port)
                return
            time.sleep(0.5)
        self.down()
        raise VpnError(f"The VPN is on, but {self.cfg.host} doesn't answer. Try again in a minute.")

    def _pump(self, proc: subprocess.Popen, last: list[str]) -> None:
        """openconnect's and ocproxy's messages go to the log (never the cookie: that only goes in on stdin)."""
        for raw in proc.stderr:
            line = raw.decode(errors="replace").strip()
            if line:
                last[:] = [line]
                self.log(f"vpn: {line}")
        proc.wait()

    def down(self) -> None:
        tunnels.drop(self.cfg.host, self.cfg.port)
        with _lock:
            proc = _started.pop(self.cfg.id, None)
        state = _read_state(self.cfg.id)
        pid = proc.pid if proc else state["pid"] if state else None
        if pid and ((proc and proc.poll() is None) or _is_openconnect(pid)):
            stop(pid, proc)
        try:
            _state_file(self.cfg.id).unlink()
        except OSError:
            pass


def stop(pid: int, proc: subprocess.Popen | None = None, timeout: float = 5) -> None:
    """SIGTERM: openconnect logs out of the VPN; SIGKILL if it takes too long. ocproxy stops by itself a second
    after openconnect is gone."""
    def gone() -> bool:
        return proc.poll() is not None if proc else not _is_openconnect(pid)

    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if gone():
            return
        time.sleep(0.1)
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


@atexit.register
def _stop_all() -> None:
    """The backend is quitting: the tunnels it started go with it."""
    with _lock:
        procs = list(_started.items())
        _started.clear()
    for cluster, proc in procs:
        if proc.poll() is None:
            stop(proc.pid, proc, timeout=2)
        try:
            _state_file(cluster).unlink()
        except OSError:
            pass
