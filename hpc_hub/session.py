"""Connect flow for one cluster: VPN → SSH (+ Duo) → compute node. UI-agnostic."""

import subprocess
import threading
import time
import traceback
from dataclasses import replace
from enum import Enum
from typing import Protocol
from urllib.parse import urlsplit

from . import limits, prompts, slurm, vpn_sso
from .askpass_server import AskpassServer
from .config import ClusterConfig, ComputeProfile
from .paths import log_dir
from .credentials import Login
from .network import link_works, network_name, reachable, route_device
from .slurm import Allocation, SlurmError
from .ssh import SshError, SshMaster
from .vpn import NeedsWebLogin, Vpn, VpnError


class State(Enum):
    DISCONNECTED = "Disconnected"
    VPN = "Connecting VPN"
    SIGNING_IN = "Signing in"
    DUO = "Approve Duo on your phone"
    ALLOCATING = "Requesting compute node"
    CONNECTED = "Connected"
    DISCONNECTING = "Disconnecting"
    ERROR = "Error"

    @property
    def busy(self) -> bool:
        return self in (State.VPN, State.SIGNING_IN, State.DUO, State.ALLOCATING, State.DISCONNECTING)


class Listener(Protocol):
    """Called from worker threads; the UI must hop to its main loop."""

    def state_changed(self, session: "ClusterSession") -> None: ...
    def log(self, session: "ClusterSession", line: str) -> None: ...
    def ask(self, session: "ClusterSession", prompt: str) -> str | None: ...
    def code(self, session: "ClusterSession", prompt: str) -> str | None: ...
    def web_login(self, session: "ClusterSession", start: vpn_sso.SsoStart, login: Login,
                  profile: str = "") -> tuple[str, str]: ...  # profile: sign in in that Chrome profile
    def pick_browser(self, session: "ClusterSession") -> str | None: ...  # Chrome profile, "" = app window


SSO_USER = "hpc-hub:sso-username"
SSO_PASS = "hpc-hub:sso-password"


class ClusterSession:
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

    # -- state -------------------------------------------------------------
    def _set(self, state: State, detail: str = "") -> None:
        self.state, self.detail = state, detail
        self.listener.state_changed(self)

    def fit(self, profile: ComputeProfile) -> ComputeProfile:
        """The profile with your default account named when none is set, on the best queue (see queues), with
        its time cut to what that queue allows (Slurm would refuse it otherwise). Blocking; worker thread."""
        if not profile.account and self._account():
            profile = replace(profile, account=self._account())
        profile = self._best_queue(profile)
        fitted, note = self._cut_time(profile)
        if note:
            self._log(note)
        return fitted

    def _cut_time(self, profile: ComputeProfile) -> tuple[ComputeProfile, str]:
        return self.limits.fit(profile) if self.limits else (profile, "")

    def _best_queue(self, profile: ComputeProfile) -> ComputeProfile:
        """Ask Slurm how long each queue in cfg.queues would wait (nothing is submitted). Of those that start
        within queue_wait seconds, take the first listed (cheapest); if none does, the one that starts soonest.
        A queue Slurm would refuse for this request (e.g. more cores than debug allows) is skipped."""
        listed = [tuple(x.strip() for x in o.split(":", 1)) for o in self.cfg.queues.split(",") if ":" in o]
        if not listed or not self.ssh:
            return profile
        mine = (profile.partition, profile.qos)
        order = listed if mine in listed else [mine, *listed]
        found = []  # (wait, rank, profile)
        try:
            for rank, (part, qos) in enumerate(order):
                p, _ = self._cut_time(replace(profile, partition=part, qos=qos))
                wait = slurm.wait_seconds(self.ssh, p)
                if wait is not None:
                    found.append((wait, rank, p))
        except (SshError, OSError, subprocess.SubprocessError):
            return profile
        if not found:
            return profile
        soon = [f for f in found if f[0] <= self.cfg.queue_wait]
        wait, _, best = min(soon, key=lambda f: f[1]) if soon else min(found, key=lambda f: (f[0], f[1]))
        seen = ", ".join(f"{p.partition}/{p.qos} {slurm.human_wait(w)}" for w, _, p in found)
        self._log(f"Queues: {seen}. Using {best.partition}/{best.qos}")
        return best

    def _account(self) -> str:
        if self.default_account is None and self.ssh:
            try:
                self.default_account = slurm.default_account(self.ssh)
            except (SshError, OSError, subprocess.SubprocessError):
                return ""
        return self.default_account or ""

    def _read_limits(self) -> None:
        def run():
            try:
                self.limits = limits.fetch(self.ssh, self.cfg.id)
            except (SshError, OSError, subprocess.SubprocessError):
                pass
        threading.Thread(target=run, daemon=True).start()

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
        return self.state == State.CONNECTED and self.ssh is not None

    @property
    def vpn(self) -> Vpn:
        return Vpn(self.cfg, self._log)

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
        ssh = SshMaster(self.cfg, username, {}, self._log) if username and self.cfg.host else None
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

        def run():
            if self._thread and self._thread is not threading.current_thread():
                self._thread.join(timeout=30)
            self._disconnect()
            if on_done:
                on_done()

        threading.Thread(target=run, daemon=True).start()

    def request_node(self, profile: ComputeProfile | None = None) -> None:
        """Ask for a node on an already connected session (profile: what you picked, else the saved one)."""
        if self.state != State.CONNECTED or self.allocation:
            return
        self._cancel.clear()
        self._thread = threading.Thread(target=self._allocate_safely, args=(profile,), daemon=True)
        self._thread.start()

    def release_node(self) -> None:
        """Give the node back (scancel) but stay connected. Your own borrowed job keeps running."""
        a = self.allocation
        if not self.connected or not a:
            return

        def run():
            if a.owned:
                self._release(a.job_id)
            else:
                self._log(f"Stopped using your job {a.job_id}, it keeps running")
            self.allocation = None
            self._set(State.CONNECTED)

        threading.Thread(target=run, daemon=True).start()

    def ensure_node(self, on_done, profile: ComputeProfile | None = None) -> None:
        """Get a node if we have none (or ours ended); on_done(Allocation | None) runs on a worker thread."""
        if self.state != State.CONNECTED:
            on_done(self.allocation)
            return

        def run():
            self.check_node()
            if not self.allocation:
                self._cancel.clear()
                self._allocate_safely(profile)
            on_done(self.allocation)

        threading.Thread(target=run, daemon=True).start()

    def extra_node(self, job_name: str, on_done, profile: ComputeProfile | None = None) -> None:
        """Separate allocation (e.g. Claude on a new node). Kept when you disconnect."""
        def run():
            try:
                a = slurm.allocate(self.ssh, self.fit(profile or self.cfg.profile), self._log, job_name=job_name)
                a.owned = False
                self._log(f"Extra node {a.node} (job {a.job_id}) for {job_name}")
                on_done(a, "")
            except (SlurmError, OSError, subprocess.SubprocessError) as e:
                self._log(f"Node request for {job_name} failed: {e}")
                on_done(None, str(e))

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

    def check_node(self) -> None:
        """Blocking. Our job can end under us (time limit, scancel): switch to another running one."""
        a = self.allocation
        if not a or not self.connected:
            return
        try:
            running = {j.job_id for j in slurm.running_jobs(self.ssh)}
        except (OSError, subprocess.SubprocessError):
            return  # can't tell, keep it
        if a.job_id in running or self.allocation is not a:
            return
        self._log(f"Job {a.job_id} on {a.node} has ended")
        self.allocation = None
        self._reuse_running_job()
        self._set(State.CONNECTED)

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
            live = self.ssh or SshMaster(self.cfg, ssh_login.username, {}, self._log)
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
                raise SshError("Login host is empty. Set it in Settings → Server & VPN.")
            self.ssh = SshMaster(self.cfg, ssh_login.username, self.askpass.env(token), self._log)
            self.ssh.start(cancelled=self._cancel.is_set)
            self._log("SSH session ready")
        except (VpnError, SshError, OSError) as e:
            self._fail(self._no_code_hint(str(e), asked))
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
        elif self.cfg.request_node_on_connect:
            self.allocation = None
            self._allocate_safely()
        else:
            self.allocation = None
            self._set(State.CONNECTED)

    def _reuse_running_job(self, quiet: bool = False) -> bool:
        """The app's own node ("hpc-hub") first, then its other nodes (Claude, ChatGPT…).
        With "Use my running job" on, any job of yours counts too."""
        try:
            jobs = slurm.running_jobs(self.ssh)
        except (OSError, subprocess.SubprocessError) as e:
            self._log(f"Could not list jobs: {e}")
            return False
        own = [j for j in jobs if j.name == slurm.MAIN_JOB]
        if own:
            job = max(own, key=lambda j: int(j.job_id))
            self.allocation = Allocation(job.job_id, job.node, owned=True)
        else:
            ours = [j for j in jobs if j.name.startswith("hpc-hub") and j.name != "hpc-hub-vscode"]
            job = slurm.pick_reusable(jobs if self.cfg.reuse_running_job else ours, self.cfg.profile.partition)
            if not job:
                return False
            self.allocation = Allocation(job.job_id, job.node, owned=False)
        if not quiet:
            self._log(f"Reusing running job {job.job_id} ({job.name}) on {job.node}")
        return True

    def _job_running(self, job_id: str) -> bool:
        try:
            return slurm.job_state(self.ssh, job_id) == "RUNNING"
        except (OSError, subprocess.SubprocessError):
            return False

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
        if self.cfg.vpn.browser:
            env["HPC_HUB_BROWSER"] = self.cfg.vpn.browser
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
            if profile is None:
                raise VpnError("Sign-in cancelled")
            if profile:
                self._set(State.VPN, f"Sign in to the VPN in Chrome ({profile})")
            else:
                self._set(State.DUO, "Sign in on the page, then approve Duo on your phone")
            token, err = self.listener.web_login(self, start, login, profile)
            if not token:
                raise VpnError(err or "Sign-in cancelled")
            cookie, host = vpn_sso.finish(start, token, ua)
            pin = vpn_sso.server_pin(host)
        except vpn_sso.SsoError as e:
            raise VpnError(str(e)) from e
        return {"COOKIE": cookie, "HOST": host, "FINGERPRINT": pin}

    def _allocate_safely(self, profile: ComputeProfile | None = None) -> None:
        profile = profile or self.cfg.profile
        if self._reuse_running_job():
            self._set(State.CONNECTED)
            return
        self._set(State.ALLOCATING, profile.summary())
        try:
            self.allocation = slurm.allocate(
                self.ssh, self.fit(profile), self._log,
                on_pending=lambda job: self._set(State.ALLOCATING, f"Job {job} waiting in queue"),
                cancelled=self._cancel.is_set,
            )
        except (SlurmError, OSError, subprocess.SubprocessError) as e:
            self._log(f"Node request failed: {e}")
            self._set(State.CONNECTED, f"No compute node: {e}")
            return
        self._set(State.CONNECTED)

    def _release(self, job_id: str) -> None:
        """scancel a node the app asked for. Blocking."""
        try:
            slurm.cancel(self.ssh, job_id)
            self._log(f"Released job {job_id}")
        except (OSError, ValueError, subprocess.SubprocessError) as e:
            self._log(f"Could not cancel job: {e}")

    def _fail(self, message: str) -> None:
        self._log(message)
        if self.ssh:
            self.ssh.stop()
            self.ssh = None
        if self._cancel.is_set():
            self._set(State.DISCONNECTED)
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
