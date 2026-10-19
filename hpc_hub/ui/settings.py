"""Per-cluster settings: login (keyring), server & VPN, compute node, VS Code job."""

from collections.abc import Callable

from gi.repository import Adw, Gtk

from .. import credentials
from ..config import VPN_PROTOCOLS, ClusterConfig, ComputeProfile
from ..credentials import Login
from ..slurm import validate
from ..vpn import split_errors
from .widgets import TARGETS


def _entry(title: str, text: str = "") -> Adw.EntryRow:
    row = Adw.EntryRow(title=title)
    row.set_text(text)
    return row


def _spin(title: str, value: int, low: int, high: int) -> Adw.SpinRow:
    row = Adw.SpinRow.new_with_range(low, high, 1)
    row.set_title(title)
    row.set_value(value)
    return row


def _switch(title: str, active: bool, subtitle: str = "") -> Adw.SwitchRow:
    row = Adw.SwitchRow(title=title, subtitle=subtitle)
    row.set_active(active)
    return row


class ProfileRows:
    """Cores, memory, time, GPUs, partition, account, QOS, extra args."""

    def __init__(self, p: ComputeProfile, extra_title: str):
        self.cpus = _spin("CPU cores", p.cpus, 1, 512)
        self.mem = _spin("Memory (GB)", p.mem_gb, 1, 4096)
        self.time = _entry("Time limit (HH:MM:SS or D-HH:MM:SS)", p.time)
        self.gpus = _spin("GPUs", p.gpus, 0, 16)
        self.partition = _entry("Partition", p.partition)
        self.account = _entry("Account", p.account)
        self.qos = _entry("QOS", p.qos)
        self.extra = _entry(extra_title, p.extra_args)
        self.rows = [self.cpus, self.mem, self.time, self.gpus, self.partition, self.account, self.qos, self.extra]

    def read(self) -> ComputeProfile:
        return ComputeProfile(
            cpus=int(self.cpus.get_value()), mem_gb=int(self.mem.get_value()), time=self.time.get_text().strip(),
            gpus=int(self.gpus.get_value()), partition=self.partition.get_text().strip(),
            account=self.account.get_text().strip(), qos=self.qos.get_text().strip(),
            extra_args=self.extra.get_text().strip())


class ClusterSettingsDialog(Adw.PreferencesDialog):
    def __init__(self, cfg: ClusterConfig, on_saved: Callable[[ClusterConfig], None],
                 edit_remote: Callable[[str, str], None] | None = None):
        super().__init__(title=f"{cfg.name} settings", search_enabled=False)
        self.cfg = cfg
        self.on_saved = on_saved
        self.edit_remote = edit_remote
        self.ssh_saved = credentials.load(cfg.id, credentials.SSH)
        self.vpn_saved = credentials.load(cfg.id, credentials.VPN)
        self.add(self._login_page())
        self.add(self._server_page())
        self.add(self._compute_page())
        self.add(self._vscode_page())
        self.set_can_close(False)
        self.connect("close-attempt", self._on_close_attempt)

    # -- pages -----------------------------------------------------------------
    def _password_row(self, saved: Login | None) -> Adw.PasswordEntryRow:
        title = "Password (saved, leave empty to keep)" if saved and saved.password else "Password"
        return Adw.PasswordEntryRow(title=title)

    def _login_page(self) -> Adw.PreferencesPage:
        page = Adw.PreferencesPage(name="login", title="Login", icon_name="dialog-password-symbolic")
        group = Adw.PreferencesGroup(
            title="Cluster login",
            description="Stored only in GNOME Keyring. Leave the password empty if you log in with an SSH key.",
        )
        self.user = _entry("Username", self.ssh_saved.username if self.ssh_saved else "")
        self.password = self._password_row(self.ssh_saved)
        self.duo = _entry("Duo answer (push, push2, phone, 1)", self.cfg.duo_answer)
        for row in (self.user, self.password, self.duo):
            group.add(row)
        page.add(group)

        forget_group = Adw.PreferencesGroup()
        forget = Adw.ButtonRow(title="Forget saved logins")
        forget.add_css_class("destructive-action")
        forget.connect("activated", self._forget)
        forget_group.add(forget)
        page.add(forget_group)
        return page

    def _server_page(self) -> Adw.PreferencesPage:
        page = Adw.PreferencesPage(name="server", title="Server & VPN", icon_name="network-server-symbolic")
        server = Adw.PreferencesGroup(title="Server")
        self.host = _entry("Login host", self.cfg.host)
        self.port = _spin("SSH port", self.cfg.port, 1, 65535)
        server.add(self.host)
        server.add(self.port)
        page.add(server)

        v = self.cfg.vpn
        vpn = Adw.PreferencesGroup(title="VPN", description="Browser sign-in (SSO) opens inside the app.")
        self.vpn_on = _switch("Use VPN", v.enabled)
        self.gateway = _entry("Gateway", v.gateway)
        self.protocol = Adw.ComboRow(title="Protocol", model=Gtk.StringList.new(VPN_PROTOCOLS))
        self.protocol.set_selected(VPN_PROTOCOLS.index(v.protocol) if v.protocol in VPN_PROTOCOLS else 0)
        self.useragent = _entry("User agent (optional)", v.useragent)
        self.authgroup = _entry("Group (optional)", v.authgroup)
        self.split = _switch("Split tunnel", v.split_tunnel,
                             "Only these networks and domains use this VPN, so other VPNs can run too")
        self.domains = _entry("VPN domains (its DNS answers these)", v.domains)
        self.routes = _entry("VPN networks (CIDR, space separated)", v.routes)
        self.same_login = _switch("Same login as cluster", v.same_login_as_ssh)
        self.vpn_user = _entry("VPN username (e.g. first.last@yale.edu)", self.vpn_saved.username if self.vpn_saved else "")
        self.vpn_password = self._password_row(self.vpn_saved)
        if not (self.vpn_saved and self.vpn_saved.password):
            self.vpn_password.set_title("VPN password (empty = cluster password)")
        else:
            self.vpn_password.set_title("VPN " + self.vpn_password.get_title().lower())
        for row in (self.vpn_on, self.gateway, self.protocol, self.useragent, self.authgroup,
                    self.split, self.domains, self.routes, self.same_login, self.vpn_user, self.vpn_password):
            vpn.add(row)
        page.add(vpn)

        self.vpn_on.connect("notify::active", lambda *_: self._sync_vpn())
        self.same_login.connect("notify::active", lambda *_: self._sync_vpn())
        self.split.connect("notify::active", lambda *_: self._sync_vpn())
        self._sync_vpn()
        return page

    def _compute_page(self) -> Adw.PreferencesPage:
        page = Adw.PreferencesPage(name="compute", title="Compute", icon_name="system-run-symbolic")
        group = Adw.PreferencesGroup(title="Compute node",
                                     description="Requested with salloc after you connect. Claude runs here.")
        self.on_connect = _switch("Request node on connect", self.cfg.request_node_on_connect)
        self.reuse = _switch("Use my running job", self.cfg.reuse_running_job,
                             "If you already have a node (e.g. for Claude), use it instead of a new one")
        self.node = ProfileRows(self.cfg.profile, "Extra salloc arguments")
        for row in (self.on_connect, self.reuse, *self.node.rows):
            group.add(row)
        page.add(group)
        return page

    def _vscode_page(self) -> Adw.PreferencesPage:
        v = self.cfg.vscode
        page = Adw.PreferencesPage(name="vscode", title="VS Code", icon_name="text-editor-symbolic")
        start = Adw.PreferencesGroup(
            title="VS Code job",
            description="The VS Code button submits this as its own batch job (sbatch) and shows its log. "
                        "If a VS Code job is already running, it opens that one instead.")
        self.vs_setup = _entry("Run first (e.g. module load VSCode)", v.setup)
        self.vs_command = _entry("Command", v.command)
        self.vs_workdir = _entry("Start in folder", v.workdir)
        self.vs_links = _switch("Open automatically", v.open_links, "When the tunnel is ready, and the GitHub sign-in page")
        self.vs_open_in = Adw.ComboRow(title="Open in", model=Gtk.StringList.new([t[1] for t in TARGETS]))
        self.vs_open_in.set_selected(next((i for i, t in enumerate(TARGETS) if t[0] == v.open_in), 0))
        for row in (self.vs_setup, self.vs_command, self.vs_workdir, self.vs_open_in, self.vs_links):
            start.add(row)
        page.add(start)

        res = Adw.PreferencesGroup(title="Job resources")
        self.vs_job = ProfileRows(v.compute, "Extra sbatch arguments")
        for row in self.vs_job.rows:
            res.add(row)
        page.add(res)

        if self.edit_remote:
            more = Adw.PreferencesGroup(title="Editor settings")
            edit = Adw.ButtonRow(title="Edit remote settings.json", end_icon_name="document-edit-symbolic")
            edit.connect("activated", lambda *_: self.edit_remote(
                "~/.vscode-server/data/Machine/settings.json", "{\n}\n"))
            more.add(edit)
            page.add(more)
        return page

    # -- behaviour ---------------------------------------------------------------
    def _sync_vpn(self) -> None:
        on = self.vpn_on.get_active()
        for row in (self.gateway, self.protocol, self.useragent, self.authgroup, self.same_login, self.split):
            row.set_sensitive(on)
        for row in (self.domains, self.routes):
            row.set_sensitive(on and self.split.get_active())
        own = on and not self.same_login.get_active()
        self.vpn_user.set_visible(own)
        self.vpn_password.set_visible(own)

    def _forget(self, *_):
        credentials.clear(self.cfg.id, credentials.SSH)
        credentials.clear(self.cfg.id, credentials.VPN)
        self.ssh_saved = self.vpn_saved = None
        self.user.set_text("")
        self.vpn_user.set_text("")
        self.password.set_title("Password")
        self.vpn_password.set_title("VPN password (empty = cluster password)")
        self.add_toast(Adw.Toast(title="Saved logins removed"))

    def _apply(self) -> list[str]:
        c, v = self.cfg, self.cfg.vpn
        trial, vs_trial = self.node.read(), self.vs_job.read()
        errors = validate(trial) + [f"VS Code: {e}" for e in validate(vs_trial)]
        if not self.vs_command.get_text().strip():
            errors.append("VS Code command is empty")
        if self.vpn_on.get_active() and not self.gateway.get_text().strip():
            errors.append("VPN gateway is empty")
        probe = type(self.cfg)(id=self.cfg.id, name=self.cfg.name)
        probe.vpn.routes, probe.vpn.domains = self.routes.get_text(), self.domains.get_text()
        errors += split_errors(probe)
        if errors:
            return errors

        c.profile = trial
        c.vscode.compute = vs_trial
        c.vscode.setup = self.vs_setup.get_text().strip()
        c.vscode.command = self.vs_command.get_text().strip()
        c.vscode.workdir = self.vs_workdir.get_text().strip() or "~"
        c.vscode.open_links = self.vs_links.get_active()
        c.vscode.open_in = TARGETS[self.vs_open_in.get_selected()][0]
        c.request_node_on_connect = self.on_connect.get_active()
        c.reuse_running_job = self.reuse.get_active()
        c.host = self.host.get_text().strip().rpartition("@")[2]  # username lives in Login
        c.port = int(self.port.get_value())
        c.duo_answer = self.duo.get_text().strip() or "push"
        v.enabled = self.vpn_on.get_active()
        v.gateway = self.gateway.get_text().strip()
        v.protocol = VPN_PROTOCOLS[self.protocol.get_selected()]
        v.useragent = self.useragent.get_text().strip()
        v.authgroup = self.authgroup.get_text().strip()
        v.same_login_as_ssh = self.same_login.get_active()
        v.split_tunnel = self.split.get_active()
        v.domains = " ".join(self.domains.get_text().split())
        v.routes = " ".join(self.routes.get_text().split())

        self._store(credentials.SSH, self.user, self.password, self.ssh_saved)
        if v.enabled and not v.same_login_as_ssh:
            self._store(credentials.VPN, self.vpn_user, self.vpn_password, self.vpn_saved)
        return []

    def _store(self, kind: str, user_row, pass_row, saved: Login | None) -> None:
        username = user_row.get_text().strip()
        password = pass_row.get_text() or (saved.password if saved else "")
        if not username:
            return
        if saved and saved.username == username and saved.password == password:
            return
        credentials.save(self.cfg.id, kind, Login(username, password))

    def _on_close_attempt(self, *_):
        errors = self._apply()
        if errors:
            self.add_toast(Adw.Toast(title=errors[0], timeout=4))
            return
        self.on_saved(self.cfg)
        self.force_close()
