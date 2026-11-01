"""Connect flow for one cluster: VPN → SSH (+ Duo) → compute node. UI-agnostic."""

import subprocess
import sys
import threading
import time
import traceback
from typing import Protocol
from urllib.parse import urlsplit

from ..compute import limits
from ..compute.slurm import Allocation
from ..core.config import ClusterConfig
from ..core.credentials import Login
from ..core.paths import log_dir
from ..core.ssh import SshError, SshMaster, new_master
from . import chrome_window, prompts, vpn_helper, vpn_sso
from .askpass_server import AskpassServer
from .messages import CANCELLED, plain
from .network import link_works, network_name, reachable, route_device
from .nodes import NodesMixin
from .state import State
from .vpn import NeedsWebLogin, Vpn, VpnError
from .vpn_android import AndroidVpn


class Listener(Protocol):
    """Called from worker threads; the UI must hop to its main loop."""

    def state_changed(self, session: "ClusterSession") -> None: ...
    def log(self, session: "ClusterSession", line: str) -> None: ...
    def ask(self, session: "ClusterSession", prompt: str) -> str | None: ...
    def code(self, session: "ClusterSession", prompt: str) -> str | None: ...
    def web_login(self, session: "ClusterSession", start: vpn_sso.SsoStart, login: Login,
                  profile: str = "", title: str = "", note: str = "") -> tuple[str, str]: ...  # profile: "" or CHOICE
    def pick_browser(self, session: "ClusterSession") -> str: ...  # "" = app window, see vpn.browser
    def confirm(self, session: "ClusterSession", title: str, text: str) -> bool: ...  # yes or no


SSO_USER = "hpc-hub:sso-username"
SSO_PASS = "hpc-hub:sso-password"


class ClusterSession(NodesMixin):
    def __init__(self, cfg: ClusterConfig, askpass: AskpassServer, listener: Listener):
        self.cfg = cfg
        self.askpass = askpass
        self.listener = listener
        self.state = State.DISCONNECTED
        self.detail = ""
        self.allocation: Allocation | None = None
        self.ssh: SshMaster | None = None
        self.vpn_used = False
        self.vpn_only = False
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self.limits = limits.cached(cfg.id)  # longest time per partition and QoS
        self.default_account: str | None = None  # looked up once per login
        self.pick_node = False  # connected and waiting for you to pick a node (cfg.ask_node)

    # -- state -------------------------------------------------------------
    def _set(self, state: State, detail: str = "") -> None:
        self.state, self.detail = state, detail
        self.listener.state_changed(self)

    def _log(self, line: str) -> None:
        self.listener.log(self, line)
        try:
            path = log_dir() / f"{self.cfg.id}.log"
            if path.exists() and path.stat().st_size > 2_000_000:
                path.replace(path.with_suffix(".log.old"))
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {line}\n")
        except OSError:
            pass

    @property
    def connected(self) -> bool:
        """Logged in over SSH, so nodes, jobs and terminals work. VPN only is not connected in this sense."""
        return self.state == State.CONNECTED and self.ssh is not None and not self.vpn_only

    @property
    def vpn(self) -> Vpn:
        if sys.platform == "android":
            return AndroidVpn(self.cfg, self._log)
        if vpn_helper.needs_helper():  # Windows and macOS: the tunnel runs in the helper service
            return vpn_helper.HelperVpn(self.cfg, self._log, lambda title, text: self._confirm(title, text))
        return Vpn(self.cfg, self._log)

    def _confirm(self, title: str, text: str) -> bool:
        confirm = getattr(self.listener, "confirm", None)  # the GTK app runs on Linux only: never asked
        return bool(confirm and confirm(self, title, text))

    # -- public API (call from UI thread) -----------------------------------
    def connect(self, ssh_login: Login, vpn_login: Login | None, vpn_only: bool = False) -> None:
        if self.state.busy:
            return
        self._cancel.clear()
        self.vpn_only = vpn_only
        self._set(State.VPN if self.cfg.vpn.enabled else State.SIGNING_IN)  # busy now, so a double-click is ignored
        self._thread = threading.Thread(
            target=self._guarded, args=(self._connect, ssh_login, vpn_login), daemon=True)
        self._thread.start()

    def _guarded(self, fn, *args) -> None:
        """Worker wrapper: an unexpected error shows on the card instead of hanging it."""
        try:
            fn(*args)
        except Exception as e:  # noqa: BLE001
            for line in traceback.format_exc().splitlines():
                self._log(line)
            self._fail(f"Unexpected error: {e}")

    def adopt(self, username: str) -> None:
        """App restarted: pick up a VPN / SSH session that is still running. Blocking."""
        vpn_up = self.cfg.vpn.enabled and self.vpn.is_active()
        ssh = new_master(self.cfg, username, {}, self._log) if username and self.cfg.host else None
        alive = bool(ssh and ssh.alive())
        if not (vpn_up or alive) or self.state != State.DISCONNECTED:
            return
        self.vpn_used, self.vpn_only = vpn_up, not alive
        self.ssh = ssh if alive else None
        if alive:
            self._reuse_running_job(quiet=True)
        self._log("Picked up running " + ("SSH session" if alive else "VPN"))
        self._set(State.CONNECTED, "" if alive else "VPN only")

    def cancel(self) -> None:
        self._cancel.set()

    def disconnect(self, on_done=None) -> None:
        self._cancel.set()
        self.pick_node = False

        def run():
            if self._thread and self._thread is not threading.current_thread():
                self._thread.join(timeout=30)
            self._disconnect()
            if on_done:
                on_done()

        threading.Thread(target=run, daemon=True).start()

    def healthy(self) -> bool:
        """Blocking check; run off the UI thread."""
        if self.vpn_used and not self.vpn.is_active():
            return False
        if self.vpn_only:
            return self.vpn_used
        if not (self.ssh and self.ssh.alive()):
            return False
        for attempt in range(2):  # after sleep the master can look alive while its link is dead
            try:
                if self.ssh.run("true", timeout=15).returncode == 0:
                    return True
            except subprocess.TimeoutExpired:
                pass
            if attempt == 0:
                time.sleep(5)
        return False

    def mark_lost(self) -> None:
        if self.state == State.CONNECTED:
            self._set(State.ERROR, "Connection lost")

    # -- workers -------------------------------------------------------------
    def _connect(self, ssh_login: Login, vpn_login: Login | None) -> None:
        handler_state = {prompts.PASSWORD: 0, prompts.DUO: 0}
        asked = []

        def on_prompt(prompt: str) -> str | None:
            asked.append(prompt)
            if prompt == SSO_USER:
                return vpn_login.username if vpn_login else None
            if prompt == SSO_PASS:
                self._set(State.DUO, "Sign in to the VPN, then approve Duo on your phone")
                return vpn_login.password if vpn_login else None
            kind = prompts.classify(prompt)
            code_login = self.cfg.second_factor == "code"  # then any other question is the code
            if kind == prompts.CODE or (code_login and kind in (prompts.DUO, prompts.UNKNOWN)):
                self._set(State.SIGNING_IN, "Type the code from your authenticator app")
                return self.listener.code(self, prompt)
            if kind in handler_state:
                handler_state[kind] += 1
                if handler_state[kind] > 1:
                    self._log(f"{kind} asked again; stopping to avoid lockout")
                    return None
                if kind == prompts.PASSWORD:
                    if not ssh_login.password:
                        self._log("The cluster asked for a password: your SSH key is not on it yet")
                    return ssh_login.password or None
                self._set(State.DUO, "Approve the Duo push on your phone")
                return prompts.duo_reply(prompt, self.cfg.duo_answer)
            return self.listener.ask(self, prompt)

        if not self.vpn_only and self.cfg.host and ssh_login.username:
            live = self.ssh or new_master(self.cfg, ssh_login.username, {}, self._log)
            if link_works(live):  # still logged in (e.g. after an app restart): no VPN, no Duo
                self.ssh = live
                self.vpn_used = self.cfg.vpn.enabled and self.vpn.is_active()
                self._log("Still logged in to the cluster, reusing that login (no Duo)")
                self._after_login()
                return
        if self.ssh:
            self.ssh.stop()
            self.ssh = None
        token = self.askpass.register(on_prompt)
        try:
            self.vpn_used = False
            if self.cfg.vpn.enabled:
                if self.vpn.is_active():
                    self._log("VPN already up")
                    self.vpn_used = True
                elif not self.vpn_only and self.cfg.host and reachable(self.cfg.host, self.cfg.port):
                    dev = route_device(self.cfg.host)
                    if dev.startswith(("vpn", "tun", "cscotun", "wg", "ppp")):
                        self._log(f"Already on a VPN that reaches {self.cfg.host} ({dev}), skipping VPN")
                    else:
                        net = network_name(dev)
                        self._log(f"On {net or 'the campus network'}, {self.cfg.host} is reachable directly, "
                                  "skipping VPN")
                else:
                    self._bring_up_vpn(vpn_login or ssh_login, token)
                    self.vpn_used = True
            if self.vpn_only:
                self._set(State.CONNECTED, "VPN only")
                return
            self._set(State.SIGNING_IN, f"{ssh_login.username}@{self.cfg.host}")
            if not self.cfg.host:
                raise SshError("The login address is empty. Set it in this cluster's Settings, under Advanced.")
            self.ssh = new_master(self.cfg, ssh_login.username, self.askpass.env(token), self._log, ask=on_prompt)
            self.ssh.start(cancelled=self._cancel.is_set)
            self._log("SSH session ready")
        except (VpnError, SshError, OSError) as e:
            self._fail(plain(self._no_code_hint(str(e), asked), self.cfg))
            return
        finally:
            self.askpass.unregister(token)

        self._after_login()

    def _no_code_hint(self, err: str, asked: list[str]) -> str:
        """A code cluster that refuses before asking anything: the account has no authenticator set up there."""
        if self.cfg.second_factor != "code" or asked or "Permission denied" not in err:
            return err
        where = f" at {self.cfg.code_setup} (Manage 2FA)" if self.cfg.code_setup else ""
        return (f"{self.cfg.name} accepted your key but never asked for a code, so no authenticator app is set up "
                f"for your account. Set one up{where}, wait up to 15 minutes, then connect again.")

    def _after_login(self) -> None:
        """Logged in: use a node that is already running before asking Slurm for a new one."""
        self._read_limits()
        if self.allocation and self._job_running(self.allocation.job_id):
            self._log(f"Reusing job {self.allocation.job_id} on {self.allocation.node}")
            self._set(State.CONNECTED)
        elif self._reuse_running_job():
            self._set(State.CONNECTED)
        elif self.cfg.request_node_on_connect and self.cfg.ask_node:
            self.allocation = None
            self.pick_node = True  # the UI shows the node's settings; request_node goes on from there
            self._set(State.CONNECTED)
        elif self.cfg.request_node_on_connect:
            self.allocation = None
            self._allocate_safely()
        else:
            self.allocation = None
            self._set(State.CONNECTED)

    def _bring_up_vpn(self, login: Login, token: str) -> None:
        vpn = self.vpn
        if vpn.is_active():
            self._log("VPN already up")
            return
        self._set(State.VPN, self.cfg.vpn.gateway)
        gw = urlsplit(self.cfg.vpn.gateway if "//" in self.cfg.vpn.gateway else "//" + self.cfg.vpn.gateway)
        if gw.hostname and not reachable(gw.hostname, gw.port or 443, timeout=8):
            raise VpnError(f"Can't reach VPN server {gw.hostname} or {self.cfg.host}. Check your network.")
        vpn.ensure_profile()
        env = self.askpass.env(token)
        try:
            auth = vpn.authenticate(
                login.username, login.password,
                ask=lambda prompt: self.listener.ask(self, prompt),
                on_duo=lambda: self._set(State.DUO, "Approve the Duo push on your phone"),
                cancelled=self._cancel.is_set,
                env=env,
            )
        except NeedsWebLogin:
            auth = self._web_vpn_login(login)
        self._set(State.VPN, "Starting tunnel")
        vpn.up(auth)
        self._log("VPN connected")

    def _web_vpn_login(self, login: Login) -> dict[str, str]:
        ua = self.cfg.vpn.useragent or "AnyConnect Linux_64 4.10.07061"
        try:
            start = vpn_sso.start(self.cfg.vpn.gateway, ua)
            if not start:
                raise VpnError("VPN server did not offer web sign-in")
            self._log("vpn: web sign-in")
            profile = self.listener.pick_browser(self)
            if profile == chrome_window.CHOICE:
                self._set(State.DUO, "Sign in in the Chrome window, then approve Duo on your phone")
            else:
                self._set(State.DUO, "Sign in on the page, then approve Duo on your phone")
            began = time.monotonic()
            token, err = self.listener.web_login(self, start, login, profile)
            if not token:
                raise VpnError(err or "Sign-in cancelled")
            self._log(f"vpn: signed in ({round(time.monotonic() - began)} s)")
            cookie, host = vpn_sso.finish(start, token, ua)
            pin = vpn_sso.server_pin(host)
        except vpn_sso.SsoError as e:
            raise VpnError(str(e)) from e
        return {"COOKIE": cookie, "HOST": host, "FINGERPRINT": pin}

    def _fail(self, message: str) -> None:
        self._log(message)
        if self.ssh:
            self.ssh.stop()
            self.ssh = None
        if self._cancel.is_set():
            self._log(CANCELLED)
            self._set(State.DISCONNECTED, CANCELLED)
        else:
            self._set(State.ERROR, message)

    def _disconnect(self) -> None:
        self._set(State.DISCONNECTING)
        if self.ssh:
            if self.allocation and not self.allocation.owned:
                self._log(f"Leaving your job {self.allocation.job_id} running")
            elif self.allocation:
                self._release(self.allocation.job_id)
            self.ssh.stop()
            self.ssh = None
        self.allocation = None
        if self.vpn_used:
            self.vpn_used = False
            try:
                self.vpn.down()
            except OSError as e:
                self._log(f"VPN down failed: {e}")
        self._set(State.DISCONNECTED)
