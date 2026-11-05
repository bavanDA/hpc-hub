"""Cluster settings in ~/.config/hpc-hub/clusters.toml. Never holds secrets."""

import json
import os
import tomllib
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path

from . import login_copy

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "hpc-hub"
CONFIG_FILE = CONFIG_DIR / "clusters.toml"
APP_FILE = CONFIG_DIR / "app.toml"

LATEX_ENGINES = ["pdf", "xelatex", "lualatex"]
VPN_PROTOCOLS = ["anyconnect", "gp", "nc", "pulse", "f5", "fortinet", "array"]
CHROME_WINDOW = "hpc-hub:chrome-window"  # vpn.browser: sign in in HPC Hub's own Chrome window (chrome_window.py)


@dataclass
class VpnSettings:
    enabled: bool = False
    gateway: str = ""
    protocol: str = "anyconnect"
    useragent: str = ""
    authgroup: str = ""
    same_login_as_ssh: bool = True
    split_tunnel: bool = True  # only the networks/domains below use the VPN
    domains: str = ""  # DNS domains answered by the VPN's DNS, space separated
    routes: str = ""  # networks sent through the VPN, space separated CIDRs
    browser: str = ""  # where the web sign-in happens: "" = the app's own window, CHROME_WINDOW = our Chrome window


def short_time(t: str) -> str:
    """"4 h", "30 min", "1 d 12 h" for Slurm's "04:00:00", "00:30:00", "1-12:00:00"."""
    days, _, hms = t.rpartition("-")
    h, m = ((int(x) if x.isdigit() else 0) for x in (hms.split(":") + ["0", "0"])[:2])
    d = int(days) if days.isdigit() else 0
    return " ".join(p for p in (f"{d} d" if d else "", f"{h} h" if h else "", f"{m} min" if m else "") if p) or t


@dataclass
class ComputeProfile:
    cpus: int = 2
    mem_gb: int = 16
    time: str = "04:00:00"
    partition: str = ""
    account: str = ""
    qos: str = ""
    gpus: int = 0
    gpu_type: str = ""  # Slurm's gres type (a100_10g, h100); "" = any GPU (compute/gpus.py)
    extra_args: str = ""

    def summary(self) -> str:
        """"4 cores · 16 GB · 4 h": the size, not the queue."""
        parts = [f"{self.cpus} core{'' if self.cpus == 1 else 's'}", f"{self.mem_gb} GB", short_time(self.time)]
        if self.gpus:
            from ..compute.gpus import describe
            name = describe(self.gpu_type)[0] if self.gpu_type else "GPU"
            parts.append(name if self.gpus == 1 and self.gpu_type else f"{self.gpus} × {name}")
        return " · ".join(parts)


TUNNEL = "code tunnel --accept-server-license-terms"
# keep the GitHub sign-in in $HOME, so a tunnel on a new node does not ask again
FILE_KEYCHAIN = "export VSCODE_CLI_USE_FILE_KEYCHAIN=1 VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT=1"


def _vscode_compute() -> ComputeProfile:
    return ComputeProfile(cpus=2, mem_gb=8, time="08:00:00")


@dataclass
class VsCodeSettings:
    """VS Code runs as its own batch job (sbatch), separate from the compute node."""
    command: str = TUNNEL
    setup: str = ""  # runs first, e.g. "module load VSCode"
    workdir: str = "~"
    open_links: bool = True
    open_in: str = "desktop"  # desktop (VS Code app) or browser (vscode.dev)
    ask: bool = True  # off: VS Code starts with these choices, no window first
    compute: ComputeProfile = field(default_factory=_vscode_compute)


@dataclass
class AgentSettings:
    """Claude, ChatGPT (codex), Antigravity (agy) or Cursor (cursor-agent) on a compute node."""
    command: str = "claude"
    workdir: str = "~"
    new_node: bool = False
    remote: bool = False
    # per-agent choices, "" = the agent's default (see agents.py for which agent uses which)
    model: str = ""
    mode: str = ""
    effort: str = ""
    sandbox: str = ""
    approval: str = ""
    minutes: int = 0  # older configs: time on a new node; 0 = the cluster's usual time
    compute: ComputeProfile = field(default_factory=lambda: ComputeProfile(cpus=0))  # cpus 0 = not picked yet


@dataclass
class LatexSettings:
    setup: str = ""  # e.g. "module load TeXLive" before building
    engine: str = "pdf"  # pdf, xelatex, lualatex
    on_node: bool = True


@dataclass
class GlobusSettings:
    collection_id: str = ""
    collection_name: str = ""


@dataclass
class ClusterConfig:
    id: str
    name: str
    host: str = ""
    port: int = 22
    duo_answer: str = "push"
    second_factor: str = "duo"  # duo (push to your phone) or code (authenticator app, TOTP)
    remember_password: bool = True  # False: the keyring keeps only the username; asked once per run
    org: str = ""  # who runs it, for copy like "NJIT doesn't support SSH keys yet"
    short: str = ""  # the name after the first mention on a screen ("Yale" for "Yale Bouchet"); "" = from name
    portal: str = ""  # web portal where you can add your SSH key after signing in in Chrome
    key_page: str = ""  # a web page where you paste your SSH public key yourself (Yale's key uploader)
    key_page_note: str = ""  # what to know about that page, shown under its button
    key_help: str = ""  # a guide to SSH keys for this cluster ("What's an SSH key?"); "" = GitHub's
    ssh_key: str = ""  # the private key to sign in with, picked by you; "" = the ones ssh tries by itself
    username_label: str = "Username"  # what the cluster calls it: UCID, NetID
    password_only: bool = False  # its SSH server takes no keys: the app needs your password (said, not hidden)
    password_too: bool = False  # with key_page: a password works as well, offered as "Use a password instead"
    key_login: bool = False  # takes SSH keys from ~/.ssh/authorized_keys: the phone app gets a key (pairing.py)
    code_setup: str = ""  # where you set up the authenticator app the cluster asks codes from
    # "partition:qos" queues to choose from, cheapest first. queue_pick "cheapest": the first that starts within
    # queue_wait seconds wins, else the one that starts soonest; "fastest": the one that starts soonest. Empty: always
    # use the queue you picked.
    queues: str = ""
    queue_wait: int = 60
    queue_pick: str = "cheapest"  # "fastest": the one that starts soonest, whatever it costs
    # Fast node: "partition:qos:time" of a short queue that starts quickly (debug); empty: no Fast node button
    fast: str = ""
    request_node_on_connect: bool = True
    ask_node: bool = False  # with request_node_on_connect: show the node's settings first instead of asking Slurm
    reuse_running_job: bool = True  # a node you already have is used before asking for one
    vpn: VpnSettings = field(default_factory=VpnSettings)
    profile: ComputeProfile = field(default_factory=ComputeProfile)
    vscode: VsCodeSettings = field(default_factory=VsCodeSettings)
    claude: AgentSettings = field(default_factory=AgentSettings)
    codex: AgentSettings = field(default_factory=lambda: AgentSettings(command="codex"))
    agy: AgentSettings = field(default_factory=lambda: AgentSettings(command="agy"))
    cursor: AgentSettings = field(default_factory=lambda: AgentSettings(command="cursor-agent"))
    globus: GlobusSettings = field(default_factory=GlobusSettings)
    latex: LatexSettings = field(default_factory=LatexSettings)

    def fast_profile(self) -> ComputeProfile | None:
        """Your node settings on the fast queue (cores, memory and GPUs stay yours); None without one."""
        part, _, rest = self.fast.partition(":")
        qos, _, time = rest.partition(":")
        if not part.strip():
            return None
        return replace(self.profile, partition=part.strip(), qos=qos.strip(), time=time.strip() or self.profile.time)

    def fast_label(self) -> str:
        """'Fast node (30 min)', 'Fast node (8 h)'."""
        p = self.fast_profile()
        if not p:
            return ""
        days, _, hms = p.time.rpartition("-")
        h, m = (int(x) if x.isdigit() else 0 for x in (hms.split(":") + ["0", "0"])[:2])
        minutes = (int(days) if days.isdigit() else 0) * 1440 + h * 60 + m
        return f"Fast node ({minutes} min)" if minutes < 60 else f"Fast node ({minutes / 60:g} h)"

    def second_step(self) -> str:
        """What the cluster asks after the password. Its admins decide, so the app says it, never asks it."""
        if self.second_factor == "code":
            return login_copy.SECOND_CODE
        return login_copy.SECOND_DUO

    @property
    def short_name(self) -> str:
        """"Wulver", "Yale", "SDSC": its short field, else the name without "(NJIT)"."""
        return self.short.strip() or self.name.split(" (")[0]

    @property
    def who(self) -> str:
        """"Yale": the org, else the short name, for copy like "Yale uses an SSH key"."""
        return self.org or self.short_name

    def key_intro(self) -> str:
        return login_copy.KEY_INTRO.format(who=self.who)

    @property
    def key_help_url(self) -> str:
        return self.key_help or login_copy.KEY_HELP

    @property
    def vpn_connection_name(self) -> str:
        return f"HPC Hub - {self.name}"


def default_clusters() -> list[ClusterConfig]:
    clusters = [
        ClusterConfig(
            id="wulver",
            queues="general:low,debug:debug,general:standard",  # free, free (4 cores, 8 h), costs SUs
            fast="debug:debug:08:00:00",  # one job at a time
            name="Wulver (NJIT)",
            short="Wulver",
            org="NJIT",
            username_label="UCID",
            host="wulver.njit.edu",
            password_only=True,  # its sshd offers no publickey, only a password (or Kerberos), then Duo
            vpn=VpnSettings(enabled=True, gateway="vpn.njit.edu", useragent="AnyConnect Linux_64 4.10.07061",
                             domains="njit.edu", routes="128.235.0.0/16"),
            profile=ComputeProfile(cpus=4, mem_gb=16),
            vscode=VsCodeSettings(
                command=f"$HOME/vscode_cli/{TUNNEL}", setup=f"{FILE_KEYCHAIN}; module purge; module load wulver",
                compute=ComputeProfile(cpus=16, mem_gb=64, time="12:00:00", partition="general", qos="standard")),
        ),
        ClusterConfig(
            id="yale",
            name="Yale Bouchet",
            short="Yale",
            org="Yale",
            host="bouchet.ycrc.yale.edu",
            username_label="NetID",
            key_page="https://sshkeys.ycrc.yale.edu/",
            key_page_note="That page only loads on campus or on the VPN.",
            key_help="https://docs.ycrc.yale.edu/clusters-at-yale/access/ssh/",
            reuse_running_job=True,
            vpn=VpnSettings(
                enabled=True,
                gateway="access.yale.edu",
                useragent="AnyConnect Linux_64 4.10.07061",
                authgroup="Default",
                same_login_as_ssh=False,  # Microsoft sign-in wants first.last@yale.edu
                domains="yale.edu",
                routes="130.132.0.0/16 128.36.0.0/16",
            ),
            profile=ComputeProfile(cpus=2, mem_gb=16, partition="devel"),
            vscode=VsCodeSettings(
                command=f"{TUNNEL} --name yale",
                setup=f"{FILE_KEYCHAIN}; module load VSCode",
                compute=ComputeProfile(cpus=2, mem_gb=15, time="06:00:00", partition="devel")),
        ),
        ClusterConfig(
            id="sdsc",
            name="SDSC Expanse",
            short="SDSC",
            org="SDSC",
            username_label="ACCESS username",
            host="login.expanse.sdsc.edu",
            second_factor="code",  # ACCESS login: ACCESS password or SSH key, then a TOTP code
            portal="https://portal.expanse.sdsc.edu",
            key_login=True,
            code_setup="https://passive.sdsc.edu",
            profile=ComputeProfile(cpus=2, mem_gb=16, partition="shared"),
            fast="debug::00:30:00",  # 2 nodes, a short line; shared can wait hours
            vscode=VsCodeSettings(setup=FILE_KEYCHAIN,
                                  compute=ComputeProfile(cpus=2, mem_gb=8, time="08:00:00", partition="shared")),
        ),
    ]
    for c in clusters:
        c.ask_node = True  # new users see the node's size before each request, so they can change it
    return clusters


def _merge(obj, data: dict):
    """Copy known keys from data onto a dataclass, keeping defaults for the rest."""
    if isinstance(data.get("hours"), int) and "minutes" not in data:  # older configs kept whole hours
        data = {**data, "minutes": data["hours"] * 60}
    for f in fields(obj):
        if f.name not in data:
            continue
        current = getattr(obj, f.name)
        value = data[f.name]
        if hasattr(current, "__dataclass_fields__") and isinstance(value, dict):
            _merge(current, value)
        elif isinstance(current, bool):
            setattr(obj, f.name, bool(value))
        elif isinstance(current, int) and isinstance(value, int):
            setattr(obj, f.name, value)
        elif isinstance(current, str) and isinstance(value, str):
            setattr(obj, f.name, value)


QUEUE_PICKS = ("cheapest", "fastest")


def load(path: Path = CONFIG_FILE) -> list[ClusterConfig]:
    clusters = default_clusters()
    if not path.exists():
        return clusters
    with open(path, "rb") as fh:
        saved = tomllib.load(fh).get("clusters", {})
    for c, default in zip(clusters, default_clusters()):
        if isinstance(saved.get(c.id), dict):
            _merge(c, saved[c.id])
        c.host = c.host.strip().rpartition("@")[2]  # user@ belongs in the login
        c.vscode.command = c.vscode.command or default.vscode.command  # old configs saved an empty alias
        if c.vpn.browser not in ("", CHROME_WINDOW):  # a Chrome profile's name, from before: the app's window
            c.vpn.browser = ""
        if c.queue_pick not in QUEUE_PICKS:
            c.queue_pick = "cheapest"
    return clusters


def _toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return json.dumps(str(v), ensure_ascii=False)


def dumps(clusters: list[ClusterConfig]) -> str:
    out = ["# HPC Hub settings. Passwords live in GNOME Keyring, not here.", ""]
    for c in clusters:
        data = asdict(c)
        data.pop("id")
        _table(out, f"clusters.{c.id}", data)
        out.append("")
    return "\n".join(out)


def _table(out: list[str], name: str, data: dict) -> None:
    if out and out[-1]:
        out.append("")
    out.append(f"[{name}]")
    out += [f"{k} = {_toml_value(v)}" for k, v in data.items() if not isinstance(v, dict)]
    for k, v in data.items():
        if isinstance(v, dict):
            _table(out, f"{name}.{k}", v)


def chosen(clusters: list[ClusterConfig], app: "AppSettings") -> list[ClusterConfig]:
    """Only the clusters you said you use (all of them if you never chose)."""
    ids = [i for i in app.clusters.split(",") if i]
    return [c for c in clusters if c.id in ids] if ids else clusters


def save_chosen(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    """Save the clusters you use without losing the settings of those you turned off."""
    mine = {c.id: c for c in clusters}
    save([mine.get(c.id, c) for c in load(path)], path)


def first_run(app: "AppSettings", path: Path = CONFIG_FILE) -> bool:
    """Nothing saved yet: time to ask which clusters you use."""
    return not path.exists() and not app.clusters


def save(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(dumps(clusters), encoding="utf-8")
    tmp.replace(path)


@dataclass
class AppSettings:
    globus_client_id: str = ""  # your Globus native app id (app.globus.org/settings/developers)
    browser_profile: str = ""  # Chrome profile name for links (e.g. "Uni"); empty = system browser
    experimental: bool = False  # show LaTeX, Skills and Scheduled agents
    clusters: str = ""  # ids of the clusters you use, comma separated; empty = all of them
    select_to_copy: bool = True  # highlighting text in a terminal copies it
    monitor_bar: bool = True  # CPU, memory and network of the host under each terminal
    appearance: str = "system"  # system (follows the computer), light, dark or a named one
    # the agent for a paper's Write message, Ask and Check my list (latex/assist.py): Fast is Claude Haiku, Low
    paper_agent: str = "claude"
    paper_model: str = "haiku"
    paper_effort: str = "low"
    paper_split: bool = True  # Write message may suggest several commits


APPEARANCES = ("system", "light", "dark", "charcoal", "daylight", "frost", "dusk", "sand")


def load_app(path: Path = APP_FILE) -> AppSettings:
    app = AppSettings()
    if path.exists():
        with open(path, "rb") as fh:
            _merge(app, tomllib.load(fh).get("app", {}))
    if app.appearance not in APPEARANCES:
        app.appearance = "system"
    return app


def save_app(app: AppSettings, path: Path = APP_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["[app]"] + [f"{k} = {_toml_value(v)}" for k, v in asdict(app).items()]
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(path)
