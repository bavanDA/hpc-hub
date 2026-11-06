"""VPN: openconnect logs in as you (password + Duo), NetworkManager runs the tunnel.

No root helper needed: the NM profile is private to your user.
"""

import getpass
import ipaddress
import os
import queue
import re
import shlex
import socket
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from urllib.parse import urlsplit

from ..core.config import ClusterConfig
from ..core.paths import SSO_BIN, WINDOWS, runtime_dir
from . import prompts

PROMPT_END = re.compile(r"[:?\]]\s*$")
NM_ENV = {**os.environ, "LC_ALL": "C"}


class VpnError(Exception):
    pass


class NeedsWebLogin(VpnError):
    """Server wants the embedded-browser SAML flow, which openconnect's CLI can't do."""


def end_stale_sign_ins() -> None:
    """A sign-in left waiting by an app that quit keeps openconnect's browser port, so the next one fails with
    "Address already in use": end ours (the ones whose browser is hpc-hub-sso) before starting."""
    subprocess.run(["pkill", "-u", str(os.getuid()), "-f", "openconnect --authenticate .*hpc-hub-sso"],
                   capture_output=True)


def run_interactive(
    argv: list[str],
    answer: Callable[[str], str | None],
    log: Callable[[str], None],
    timeout: float = 180,
    cancelled: Callable[[], bool] = lambda: False,
    env: dict | None = None,
) -> tuple[int, list[str], list[str]]:
    """Run a prompting program, answering prompts. Returns (code, stdout lines, stderr lines).

    Stdout is not logged: openconnect prints the session cookie there.
    """
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, env=env, creationflags=0x0800_0000 if WINDOWS else 0,  # no console window
    )
    chunks: queue.Queue = queue.Queue()

    def pump(stream, name):
        while data := os.read(stream.fileno(), 4096):
            chunks.put((name, data.decode(errors="replace")))
        chunks.put((name, None))

    for stream, name in ((proc.stdout, "out"), (proc.stderr, "err")):
        threading.Thread(target=pump, args=(stream, name), daemon=True).start()

    lines = {"out": [], "err": []}
    partial = {"out": "", "err": ""}
    open_streams = 2
    deadline = time.monotonic() + timeout

    def stop(reason: str):
        proc.kill()
        proc.wait()
        raise VpnError(reason)

    while open_streams:
        if cancelled():
            stop("Cancelled")
        if time.monotonic() > deadline:
            stop("VPN login timed out")
        try:
            name, data = chunks.get(timeout=0.3)
        except queue.Empty:
            for name in ("err", "out"):
                text = partial[name]
                if text.strip() and PROMPT_END.search(text) and "=" not in text.split(":")[0]:
                    partial[name] = ""
                    reply = answer(text.strip())
                    if reply is None:
                        stop("VPN login cancelled")
                    try:
                        proc.stdin.write((reply + "\n").encode())
                        proc.stdin.flush()
                    except BrokenPipeError:
                        pass
                    break
            continue
        if data is None:
            open_streams -= 1
            continue
        *done, partial[name] = (partial[name] + data).split("\n")
        for line in done:
            lines[name].append(line)
            if name == "err" and line.strip():
                log(f"vpn: {line.strip()}")
    for name in ("out", "err"):
        if partial[name]:
            lines[name].append(partial[name])
    return proc.wait(), lines["out"], lines["err"]


def parse_auth_output(lines: list[str]) -> dict[str, str]:
    result = {}
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and key.isupper():
            parts = shlex.split(value) if value else [""]
            result[key] = parts[0] if parts else ""
    return result


def nm_vpn_data(cfg: ClusterConfig) -> str:
    v = cfg.vpn
    data = {
        "gateway": v.gateway,
        "protocol": v.protocol,
        "authtype": "password",
        "cookie-flags": "2",
        "gateway-flags": "2",
        "gwcert-flags": "2",
        "resolve-flags": "2",
    }
    if v.useragent:
        data["useragent"] = v.useragent
    return ", ".join(f"{k} = {val.replace(',', '\\,')}" for k, val in data.items())


def nm_secrets(auth: dict[str, str], gateway: str, lookup=socket.gethostbyname) -> dict[str, str]:
    """Secrets NetworkManager's openconnect plugin needs; it asks for all four."""
    gw = auth.get("CONNECT_URL") or auth.get("HOST") or gateway
    host = urlsplit(gw if "://" in gw else f"//{gw}").hostname or ""
    resolve = auth.get("RESOLVE", "")
    if not resolve and host:
        try:
            resolve = f"{host}:{lookup(host)}"
        except OSError:
            resolve = ""
    return {"cookie": auth["COOKIE"], "gateway": gw, "gwcert": auth.get("FINGERPRINT", ""), "resolve": resolve}


def split_errors(cfg: ClusterConfig) -> list[str]:
    errors = []
    for net in cfg.vpn.routes.split():
        try:
            ipaddress.ip_network(net, strict=False)
        except ValueError:
            errors.append(f"Not a network: {net}")
    for dom in cfg.vpn.domains.split():
        if not re.fullmatch(r"~?[A-Za-z0-9.-]+", dom):
            errors.append(f"Not a domain: {dom}")
    return errors


def nm_ip_args(cfg: ClusterConfig) -> list[str]:
    """Split tunnel: no default route, DNS only for its domains, explicit routes."""
    v = cfg.vpn
    if not v.split_tunnel:
        return ["ipv4.never-default", "no", "ipv6.never-default", "no",
                "ipv4.dns-search", "", "ipv4.routes", "", "ipv6.routes", ""]
    nets = [ipaddress.ip_network(n, strict=False) for n in v.routes.split()]
    domains = ",".join("~" + d.lstrip("~") for d in v.domains.split())
    return ["ipv4.never-default", "yes", "ipv6.never-default", "yes",
            "ipv4.dns-search", domains,
            "ipv4.routes", ",".join(str(n) for n in nets if n.version == 4),
            "ipv6.routes", ",".join(str(n) for n in nets if n.version == 6)]


class Vpn:
    """Linux: NetworkManager runs the tunnel. Windows and macOS: vpn_helper.HelperVpn."""

    def __init__(self, cfg: ClusterConfig, log: Callable[[str], None]):
        self.cfg = cfg
        self.log = log
        self.name = cfg.vpn_connection_name
        self.openconnect = "openconnect"
        self.external_browser = str(SSO_BIN)  # SAML gateways: the sign-in window (bin/hpc-hub-sso)
        self.extra_args: list[str] = []

    def _nmcli(self, *args: str, timeout: float = 60) -> subprocess.CompletedProcess:
        return subprocess.run(["nmcli", *args], capture_output=True, text=True, timeout=timeout, env=NM_ENV)

    def ensure_profile(self) -> None:
        if not self.cfg.vpn.gateway:
            raise VpnError("The VPN address is empty. Set it in this cluster's Settings, under Advanced.")
        data = nm_vpn_data(self.cfg)
        names = self._nmcli("-t", "-g", "NAME", "connection", "show").stdout.splitlines()
        errors = split_errors(self.cfg)
        if errors:
            raise VpnError("; ".join(errors))
        ip = nm_ip_args(self.cfg)
        if self.name in names:
            res = self._nmcli("connection", "modify", "id", self.name, "vpn.data", data, *ip)
        else:
            res = self._nmcli(
                "connection", "add", "type", "vpn", "con-name", self.name,
                "vpn-type", "openconnect", "connection.autoconnect", "no",
                "connection.permissions", f"user:{getpass.getuser()}", "vpn.data", data, *ip,
            )
        if res.returncode != 0:
            raise VpnError(res.stderr.strip() or "Could not set up NetworkManager VPN profile")

    def is_active(self) -> bool:
        res = self._nmcli("-t", "-g", "NAME", "connection", "show", "--active")
        return self.name in res.stdout.splitlines()

    def authenticate(
        self,
        username: str,
        password: str,
        ask: Callable[[str], str | None],
        on_duo: Callable[[], None],
        cancelled: Callable[[], bool] = lambda: False,
        env: dict | None = None,
    ) -> dict[str, str]:
        """Log in. Browser (SAML) gateways open the in-app sign-in window via env's askpass."""
        v = self.cfg.vpn
        argv = [self.openconnect, "--authenticate", "--protocol", v.protocol, "--user", username]
        if self.external_browser:
            end_stale_sign_ins()
            argv += ["--external-browser", self.external_browser]
        argv += self.extra_args
        if v.useragent:
            argv += ["--useragent", v.useragent]
        if v.authgroup:
            argv += ["--authgroup", v.authgroup]
        argv.append(v.gateway)

        asked = {prompts.PASSWORD: 0, prompts.DUO: 0}

        def answer(prompt: str) -> str | None:
            kind = prompts.classify(prompt)
            if kind == prompts.USERNAME:
                return username
            if kind == prompts.GROUP:
                return prompts.group_choice(prompt, v.authgroup)
            if kind in asked:
                asked[kind] += 1
                if asked[kind] > 1:
                    return None  # rejected once; don't hammer the account
                if kind == prompts.PASSWORD:
                    return password
                on_duo()
                return prompts.duo_reply(prompt, self.cfg.duo_answer)
            return ask(prompt)

        code, out, err = run_interactive(argv, answer, self.log, timeout=300, cancelled=cancelled, env=env)
        result = parse_auth_output(out)
        if code != 0 or "COOKIE" not in result:
            if any("No SSO handler" in line for line in err):
                raise NeedsWebLogin("VPN wants web sign-in")
            if asked[prompts.PASSWORD] > 1:
                raise VpnError("VPN rejected the password")
            tail = next((line for line in reversed(err) if line.strip()), "")
            raise VpnError(f"VPN login failed: {tail}" if tail else "VPN login failed")
        return result

    def up(self, auth: dict[str, str]) -> None:
        secrets = nm_secrets(auth, self.cfg.vpn.gateway)
        body = "".join(f"vpn.secrets.{k}:{v}\n" for k, v in secrets.items())
        fd, path = tempfile.mkstemp(dir=runtime_dir(), prefix="nm-")
        try:
            with os.fdopen(fd, "w") as fh:
                fh.write(body)
            res = self._nmcli("connection", "up", "id", self.name, "passwd-file", path, timeout=120)
        finally:
            os.unlink(path)
        if res.returncode != 0:
            raise VpnError(res.stderr.strip() or "VPN tunnel did not come up")

    def down(self) -> None:
        if self.is_active():
            self._nmcli("connection", "down", "id", self.name)
