"""VPN on Windows and macOS: sign in as you, then ask the helper service to run the tunnel.

See docs/design/vpn-helper.md. The helper (app/vpn-helper, a Windows service or a launchd daemon) is installed
once, with the admin prompt the system shows; after that it only starts and stops openconnect for the gateways
it was installed for.
"""

import ipaddress
import json
import os
import shlex
import socket
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlsplit

from ..core.config import ClusterConfig
from ..core.paths import WINDOWS, resources_dir
from .vpn import Vpn, VpnError, nm_secrets, split_errors

VERSION = "1"  # the protocol this app speaks; an older helper is installed again
PIPE = r"\\.\pipe\hpc-hub-vpn"
SOCKET = "/var/run/hpc-hub-vpn.sock"
UP_TIMEOUT = 90  # seconds from "up" to the tunnel being there
KNOWN_GATEWAYS = ("vpn.njit.edu", "access.yale.edu")  # always allowed, so adding Yale later needs no new prompt


class HelperMissing(VpnError):
    """No helper, or one that speaks another version: it has to be installed (once)."""


def request(message: dict, timeout: float = 15, address: str | None = None) -> dict:
    """One request, one answer (a JSON line each way)."""
    line = (json.dumps(message) + "\n").encode()
    try:
        if WINDOWS and not address:
            with open(PIPE, "r+b", buffering=0) as pipe:
                pipe.write(line)
                data = pipe.readline()
        else:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                s.connect(address or SOCKET)
                s.sendall(line)
                data = s.makefile("rb").readline()
    except (FileNotFoundError, ConnectionRefusedError) as e:
        raise HelperMissing("The VPN helper is not installed") from e
    except OSError as e:
        raise VpnError(f"Could not reach the VPN helper: {e}") from e
    try:
        answer = json.loads(data)
    except ValueError as e:
        raise VpnError("The VPN helper gave an answer HPC Hub can't read") from e
    if not isinstance(answer, dict):
        raise VpnError("The VPN helper gave an answer HPC Hub can't read")
    return answer


def _checked(answer: dict) -> dict:
    if not answer.get("ok"):
        raise VpnError(f"VPN helper: {answer.get('error') or 'refused'}")
    return answer


def installed_version(address: str | None = None) -> str | None:
    try:
        return str(request({"op": "version"}, timeout=5, address=address).get("version") or "")
    except HelperMissing:
        return None


# -- installing it (once) ---------------------------------------------------------------------------

def bundle() -> Path:
    """<resources>/vpn: the helper and openconnect that ship with the app."""
    root = resources_dir()
    if not root:
        raise VpnError("HPC Hub can't find its VPN files (no resources folder)")
    return root / "vpn"


def helper_program() -> Path:
    return bundle() / ("hpc-hub-vpn-helper.exe" if WINDOWS else "hpc-hub-vpn-helper")


def _user_id() -> str:
    """Who may ask the helper: your Windows SID, or your macOS uid."""
    if not WINDOWS:
        return str(os.getuid())
    out = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=15,
                         creationflags=0x0800_0000).stdout  # CREATE_NO_WINDOW
    sid = out.strip().rsplit(",", 1)[-1].strip().strip('"')
    if not sid.startswith("S-1-"):
        raise VpnError("Could not find your Windows account id")
    return sid


def install_args(gateways: list[str], user: str, source: Path) -> list[str]:
    args = ["install", "--user", user, "--from", str(source)]
    for g in dict.fromkeys(h.lower() for h in [*KNOWN_GATEWAYS, *gateways] if h):
        args += ["--gateway", g]
    return args


def install(gateways: list[str]) -> None:
    """Install (or upgrade) the helper as admin: Windows shows its UAC prompt, macOS asks your password. Blocking."""
    program = helper_program()
    if not program.exists():
        raise VpnError(f"The VPN helper is missing from this HPC Hub ({program})")
    args = install_args(gateways, _user_id(), bundle())
    if WINDOWS:
        code = _run_as_admin_windows(program, args)
    else:
        line = " ".join(shlex.quote(a) for a in [str(program), *args])
        script = f'do shell script "{_applescript(line)}" with administrator privileges'
        code = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300).returncode
    if code != 0:
        raise VpnError("The VPN helper was not installed (permission was not given, or it failed)")
    for _ in range(20):  # the service needs a moment to start
        if installed_version() == VERSION:
            return
        time.sleep(0.5)
    raise VpnError("The VPN helper was installed but doesn't answer")


def _applescript(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _run_as_admin_windows(program: Path, args: list[str]) -> int:
    """ShellExecuteEx with "runas" (the UAC prompt), then wait for it. Returns its exit code (1 if refused)."""
    import ctypes
    from ctypes import wintypes

    class Info(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("fMask", ctypes.c_ulong), ("hwnd", wintypes.HWND),
                    ("lpVerb", wintypes.LPCWSTR), ("lpFile", wintypes.LPCWSTR), ("lpParameters", wintypes.LPCWSTR),
                    ("lpDirectory", wintypes.LPCWSTR), ("nShow", ctypes.c_int), ("hInstApp", wintypes.HINSTANCE),
                    ("lpIDList", ctypes.c_void_p), ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
                    ("dwHotKey", wintypes.DWORD), ("hIcon", wintypes.HANDLE), ("hProcess", wintypes.HANDLE)]
    info = Info(cbSize=ctypes.sizeof(Info), fMask=0x40, lpVerb="runas", lpFile=str(program),  # NOCLOSEPROCESS
                lpParameters=subprocess.list2cmdline(args), nShow=0)
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(info)):
        return 1  # refused at the prompt
    kernel = ctypes.windll.kernel32
    kernel.WaitForSingleObject(info.hProcess, 0xFFFFFFFF)
    code = wintypes.DWORD()
    kernel.GetExitCodeProcess(info.hProcess, ctypes.byref(code))
    kernel.CloseHandle(info.hProcess)
    return code.value


# -- the tunnel -----------------------------------------------------------------------------------------

def up_request(cfg: ClusterConfig, auth: dict[str, str]) -> dict:
    """What the helper gets for "up": the gateway, the sign-in's cookie and certificate pin, the split routes."""
    v = cfg.vpn
    secrets = nm_secrets(auth, v.gateway)
    url = secrets["gateway"] if "://" in secrets["gateway"] else f"https://{secrets['gateway']}"
    routes = [str(ipaddress.ip_network(n, strict=False)) for n in v.routes.split()] if v.split_tunnel else []
    domains = [d.lstrip("~") for d in v.domains.split()] if v.split_tunnel else []
    return {"op": "up", "url": url, "cookie": secrets["cookie"], "servercert": secrets["gwcert"],
            "useragent": v.useragent, "protocol": v.protocol, "resolve": secrets["resolve"],
            "routes": routes, "domains": domains}


class HelperVpn(Vpn):
    """Vpn for Windows and macOS: same sign-in (with the openconnect that ships with the app), the tunnel through
    the helper. confirm(title, text) asks you before the one-time install; False: you said no."""

    def __init__(self, cfg: ClusterConfig, log: Callable[[str], None],
                 confirm: Callable[[str, str], bool] = lambda title, text: False, address: str | None = None):
        super().__init__(cfg, log)
        self.confirm = confirm
        self.address = address  # tests: a socket of their own
        self.openconnect = str(openconnect_program())
        self.external_browser = ""  # SAML gateways use the in-app sign-in (vpn_sso), not an external browser
        cafile = Path(self.openconnect).with_name("cert.pem")
        if cafile.exists():  # macOS: the shipped openconnect knows no system certificates, so it gets a list
            self.extra_args = ["--cafile", str(cafile)]

    def ensure_profile(self) -> None:
        if not self.cfg.vpn.gateway:
            raise VpnError("VPN gateway is empty. Set it in Settings → Server & VPN.")
        errors = split_errors(self.cfg)
        if errors:
            raise VpnError("; ".join(errors))
        if installed_version(self.address) == VERSION:
            return
        host = urlsplit(self.cfg.vpn.gateway if "//" in self.cfg.vpn.gateway else "//" + self.cfg.vpn.gateway)
        system = "Windows" if WINDOWS else "macOS"
        if not self.confirm("Set up the VPN helper", (
                f"To connect the VPN, HPC Hub installs a small helper once. {system} will ask for permission. "
                "The helper only starts and stops the VPN to your cluster's servers, for your account.")):
            raise VpnError("The VPN needs the helper. Connect again to set it up.")
        self.log("Installing the VPN helper")
        install([host.hostname or self.cfg.vpn.gateway])
        self.log("VPN helper installed")

    def _status(self) -> dict:
        return _checked(request({"op": "status"}, address=self.address))

    def is_active(self) -> bool:
        try:
            return self._status().get("state") == "up"
        except VpnError:
            return False

    def up(self, auth: dict[str, str]) -> None:
        _checked(request(up_request(self.cfg, auth), address=self.address))
        deadline = time.monotonic() + UP_TIMEOUT
        while time.monotonic() < deadline:
            status = self._status()
            if status.get("state") == "up":
                return
            if status.get("state") == "down":
                for line in status.get("log") or []:
                    self.log(f"vpn: {line}")
                raise VpnError(f"VPN tunnel did not come up: {status.get('error') or 'openconnect stopped'}")
            time.sleep(0.5)
        self.down()
        raise VpnError("VPN tunnel did not come up in time")

    def down(self) -> None:
        try:
            _checked(request({"op": "down"}, timeout=30, address=self.address))
        except HelperMissing:
            pass


def openconnect_program() -> Path:
    """The openconnect that ships with the app (for signing in), else the one on PATH."""
    try:
        name = "openconnect.exe" if WINDOWS else "openconnect"
        shipped = bundle() / "openconnect" / name
        if shipped.exists():
            return shipped
    except VpnError:
        pass
    return Path("openconnect")


def needs_helper() -> bool:
    return WINDOWS or sys.platform == "darwin"
