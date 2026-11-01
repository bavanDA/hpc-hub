"""Per-cluster settings in two pages, like the desktop app's SettingsDialog.tsx: Sign-in (username, password or
key; the server and VPN under Advanced) and Compute (the node; Slurm details and the VS Code job under Advanced)."""

from collections.abc import Callable

from gi.repository import Adw, GObject, Gtk

from ...compute.limits import Limits, minutes, slurm_time
from ...compute.slurm import validate
from ...compute.ui.duration import DurationRow
from ...core import credentials
from ...core import login_copy as C
from ...core.config import VPN_PROTOCOLS, ClusterConfig, ComputeProfile
from ...core.credentials import Login
from ...ui.widgets import TARGETS
from .. import chrome_window
from ..vpn import split_errors
from .authenticator_help import AuthenticatorHelp
from .key_group import KeyGroup

STORE = "your system keyring"  # where the GTK app keeps logins (credentials.py: GNOME Keyring)


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

    def __init__(self, p: ComputeProfile, extra_title: str, limits: Limits | None):
        self.cpus = _spin("CPU cores", p.cpus, 1, 512)
        self.mem = _spin("Memory (GB)", p.mem_gb, 1, 4096)
        self.time = DurationRow("Time", minutes(p.time) or 240, limits, p.partition, p.qos)
        self.gpus = _spin("GPUs", p.gpus, 0, 16)
        self.partition = _entry("Partition", p.partition)
        self.account = _entry("Account", p.account)
        self.qos = _entry("QOS", p.qos)
        self.extra = _entry(extra_title, p.extra_args)
        self.size_rows = [self.cpus, self.mem, self.time, self.gpus, self.partition]
        self.more_rows = [self.account, self.qos, self.extra]
        self.rows = self.size_rows + self.more_rows
        for row in (self.partition, self.qos):
            row.connect("changed", lambda *_: self.time.set_queue(self.partition.get_text().strip(),
                                                                   self.qos.get_text().strip()))

    def read(self) -> ComputeProfile:
        return ComputeProfile(
            cpus=int(self.cpus.get_value()), mem_gb=int(self.mem.get_value()),
            time=slurm_time(self.time.minutes()),
            gpus=int(self.gpus.get_value()), partition=self.partition.get_text().strip(),
            account=self.account.get_text().strip(), qos=self.qos.get_text().strip(),
            extra_args=self.extra.get_text().strip())


class ClusterSettingsDialog(Adw.PreferencesDialog):
    def __init__(self, cfg: ClusterConfig, on_saved: Callable[[ClusterConfig], None],
                 edit_remote: Callable[[str, str], None] | None = None, limits: Limits | None = None):
        super().__init__(title=f"{cfg.name} settings", search_enabled=False)
        self.cfg, self.limits = cfg, limits
        self.on_saved = on_saved
        self.edit_remote = edit_remote
        self.ssh_saved = credentials.load(cfg.id, credentials.SSH)
        self.vpn_saved = credentials.load(cfg.id, credentials.VPN)
        self.saved_hints: list[Gtk.Label] = []
        self.add(self._login_page())
        self.add(self._compute_page())
        self.set_can_close(False)
        self.connect("close-attempt", self._on_close_attempt)

    # -- pages -----------------------------------------------------------------
    def _password_row(self, saved: Login | None, title: str = C.PASSWORD) -> Adw.PasswordEntryRow:
        """With a quiet "Saved" while it's empty and a password is saved (leave it empty to keep that one)."""
        row = Adw.PasswordEntryRow(title=title)
        if saved and saved.password:
            hint = Gtk.Label(label=C.SAVED, css_classes=["dim-label"])
            row.add_suffix(hint)
            row.connect("changed", lambda r: hint.set_visible(not r.get_text()))
            self.saved_hints.append(hint)
        return row

    def _login_page(self) -> Adw.PreferencesPage:
        page = Adw.PreferencesPage(name="login", title="Sign-in", icon_name="dialog-password-symbolic")
        c = self.cfg
        self.user = _entry(c.username_label, self.ssh_saved.username if self.ssh_saved else "")
        self.password = self._password_row(self.ssh_saved)
        if c.key_page:
            group = KeyGroup(c, self.user, self.password, description=c.key_intro())
        else:
            group = Adw.PreferencesGroup(description=C.SAVED_IN.format(store=STORE))
            group.add(self.user)
            group.add(self.password)
        if self.cfg.second_factor == "code":
            help_row = Adw.ButtonRow(title=C.CODE_SETUP, start_icon_name="help-about-symbolic")
            help_row.connect("activated", lambda *_: AuthenticatorHelp(self.cfg).present(self))
            group.add(help_row)
        page.add(group)
        # the second step is the cluster's (its admins decide), so it is said, not chosen (key steps say it themselves)
        if not c.key_page:
            page.add(Adw.PreferencesGroup(description=self.cfg.second_step()))

        forget_group = Adw.PreferencesGroup()
        forget = Gtk.Button(label=f"Forget {c.username_label if c.key_page else 'saved password'}",
                            css_classes=["flat", "error"], halign=Gtk.Align.START)
        forget.connect("clicked", self._forget)
        forget_group.add(forget)
        page.add(forget_group)

        advanced = Adw.PreferencesGroup(title="Advanced")
        server = Adw.ExpanderRow(title="Server", subtitle=f"{self.cfg.host}, port {self.cfg.port}")
        self.host = _entry("Login host", self.cfg.host)
        self.port = _spin("SSH port", self.cfg.port, 1, 65535)
        server.add_row(self.host)
        server.add_row(self.port)
        advanced.add(server)
        advanced.add(self._vpn_rows())
        page.add(advanced)
        return page

    def _vpn_rows(self) -> Adw.ExpanderRow:
        v = self.cfg.vpn
        vpn = Adw.ExpanderRow(title="VPN", subtitle=f"{self.cfg.who} VPN" if v.enabled else "Off")
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
        choices = [("", "Built-in window")]
        if chrome_window.available() or v.browser == chrome_window.CHOICE:
            choices.append((chrome_window.CHOICE, chrome_window.TITLE))
        self.sign_in_values = [value for value, _ in choices]
        self.sign_in = Adw.ComboRow(title="Sign in with", model=Gtk.StringList.new([label for _, label in choices]))
        self.sign_in.set_selected(self.sign_in_values.index(v.browser) if v.browser in self.sign_in_values else 0)
        self.sign_in.set_subtitle("Both are HPC Hub's own windows, never your own browser")
        self.vpn_user = _entry("VPN username (e.g. first.last@yale.edu)",
                               self.vpn_saved.username if self.vpn_saved else "")
        self.vpn_password = self._password_row(
            self.vpn_saved, "VPN password" if self.vpn_saved and self.vpn_saved.password
            else "VPN password (empty = cluster password)")
        for row in (self.vpn_on, self.gateway, self.sign_in, self.protocol, self.useragent, self.authgroup,
                    self.split, self.domains, self.routes, self.same_login, self.vpn_user, self.vpn_password):
            vpn.add_row(row)

        self.vpn_on.connect("notify::active", lambda *_: self._sync_vpn())
        self.same_login.connect("notify::active", lambda *_: self._sync_vpn())
        self.split.connect("notify::active", lambda *_: self._sync_vpn())
        self._sync_vpn()
        return vpn

    def _compute_page(self) -> Adw.PreferencesPage:
        page = Adw.PreferencesPage(name="compute", title="Compute", icon_name="system-run-symbolic")
        group = Adw.PreferencesGroup(
            description="Your terminals and agents run on a compute node, not the busy login node.")
        self.on_connect = _switch("Get a compute node when I connect", self.cfg.request_node_on_connect)
        self.ask_node = _switch("Review these before each request", self.cfg.ask_node)
        self.on_connect.bind_property("active", self.ask_node, "visible", GObject.BindingFlags.SYNC_CREATE)
        self.reuse = _switch("Reuse a node you already have", self.cfg.reuse_running_job)
        for row in (self.on_connect, self.ask_node, self.reuse):
            group.add(row)
        page.add(group)

        size = Adw.PreferencesGroup(title="Node size")
        self.node = ProfileRows(self.cfg.profile, "Extra salloc arguments", self.limits)
        for row in self.node.size_rows:
            size.add(row)
        page.add(size)

        advanced = Adw.PreferencesGroup(title="Advanced")
        slurm = Adw.ExpanderRow(title="Slurm details", subtitle="Account, QOS and extra salloc arguments")
        for row in self.node.more_rows:
            slurm.add_row(row)
        advanced.add(slurm)
        advanced.add(self._vscode_rows())
        page.add(advanced)
        return page

    def _vscode_rows(self) -> Adw.ExpanderRow:
        v = self.cfg.vscode
        start = Adw.ExpanderRow(title="VS Code job",
                                subtitle="Runs as its own batch job; an open one is reused")
        self.vs_setup = _entry("Run first (e.g. module load VSCode)", v.setup)
        self.vs_command = _entry("Command", v.command)
        self.vs_workdir = _entry("Start in folder", v.workdir)
        self.vs_links = _switch("Open automatically", v.open_links,
                                "When the tunnel is ready, and the GitHub sign-in page")
        self.vs_open_in = Adw.ComboRow(title="Open in", model=Gtk.StringList.new([t[1] for t in TARGETS]))
        self.vs_open_in.set_selected(next((i for i, t in enumerate(TARGETS) if t[0] == v.open_in), 0))
        for row in (self.vs_setup, self.vs_command, self.vs_workdir, self.vs_open_in, self.vs_links):
            start.add_row(row)
        self.vs_job = ProfileRows(v.compute, "Extra sbatch arguments", self.limits)
        for row in self.vs_job.rows:
            start.add_row(row)
        if self.edit_remote:
            edit = Adw.ButtonRow(title="Edit remote settings.json", end_icon_name="document-edit-symbolic")
            edit.connect("activated", lambda *_: self.edit_remote(
                "~/.vscode-server/data/Machine/settings.json", "{\n}\n"))
            start.add_row(edit)
        return start

    # -- behaviour ---------------------------------------------------------------
    def _sync_vpn(self) -> None:
        on = self.vpn_on.get_active()
        for row in (self.gateway, self.sign_in, self.protocol, self.useragent, self.authgroup, self.same_login,
                    self.split):
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
        for hint in self.saved_hints:
            hint.set_visible(False)
        self.vpn_password.set_title("VPN password (empty = cluster password)")
        self.add_toast(Adw.Toast(title="Saved password removed"))

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
        c.ask_node = self.ask_node.get_active()
        c.reuse_running_job = self.reuse.get_active()
        c.host = self.host.get_text().strip().rpartition("@")[2]  # username lives in Login
        c.port = int(self.port.get_value())
        v.enabled = self.vpn_on.get_active()
        v.gateway = self.gateway.get_text().strip()
        v.protocol = VPN_PROTOCOLS[self.protocol.get_selected()]
        v.useragent = self.useragent.get_text().strip()
        v.authgroup = self.authgroup.get_text().strip()
        v.same_login_as_ssh = self.same_login.get_active()
        i = self.sign_in.get_selected()
        v.browser = self.sign_in_values[i] if 0 <= i < len(self.sign_in_values) else ""
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
