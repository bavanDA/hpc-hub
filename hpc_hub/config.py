"""Cluster settings in ~/.config/hpc-hub/clusters.toml. Never holds secrets."""

import json
import os
import tomllib
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "hpc-hub"
CONFIG_FILE = CONFIG_DIR / "clusters.toml"
APP_FILE = CONFIG_DIR / "app.toml"

LATEX_ENGINES = ["pdf", "xelatex", "lualatex"]
VPN_PROTOCOLS = ["anyconnect", "gp", "nc", "pulse", "f5", "fortinet", "array"]


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
    browser: str = ""  # sign in with this Chrome profile (e.g. "Uni"); "" = the app's own window


@dataclass
class ComputeProfile:
    cpus: int = 2
    mem_gb: int = 16
    time: str = "04:00:00"
    partition: str = ""
    account: str = ""
    qos: str = ""
    gpus: int = 0
    extra_args: str = ""

    def summary(self) -> str:
        parts = [f"{self.cpus} cores", f"{self.mem_gb} GB", self.time]
        if self.gpus:
            parts.append(f"{self.gpus} GPU")
        if self.partition:
            parts.append(self.partition)
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
    compute: ComputeProfile = field(default_factory=_vscode_compute)


@dataclass
class AgentSettings:
    """Claude, ChatGPT (codex), Antigravity (agy) or Cursor (cursor-agent) on a compute node."""
    command: str = "claude"
    workdir: str = "~"
    skip_permissions: bool = False
    new_node: bool = False
    remote: bool = False
    # per-agent choices, "" = the agent's default (see agents.py for which agent uses which)
    model: str = ""
    mode: str = ""
    effort: str = ""
    sandbox: str = ""
    approval: str = ""
    minutes: int = 0  # time on a new node; 0 = the cluster's usual time


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
    request_node_on_connect: bool = True
    reuse_running_job: bool = False
    vpn: VpnSettings = field(default_factory=VpnSettings)
    profile: ComputeProfile = field(default_factory=ComputeProfile)
    vscode: VsCodeSettings = field(default_factory=VsCodeSettings)
    claude: AgentSettings = field(default_factory=AgentSettings)
    codex: AgentSettings = field(default_factory=lambda: AgentSettings(command="codex"))
    agy: AgentSettings = field(default_factory=lambda: AgentSettings(command="agy"))
    cursor: AgentSettings = field(default_factory=lambda: AgentSettings(command="cursor-agent"))
    globus: GlobusSettings = field(default_factory=GlobusSettings)
    latex: LatexSettings = field(default_factory=LatexSettings)

    @property
    def vpn_connection_name(self) -> str:
        return f"HPC Hub - {self.name}"


def default_clusters() -> list[ClusterConfig]:
    return [
        ClusterConfig(
            id="wulver",
            name="Wulver (NJIT)",
            host="wulver.njit.edu",
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
            host="bouchet.ycrc.yale.edu",
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
            host="login.expanse.sdsc.edu",
            second_factor="code",  # ACCESS login: ACCESS password, then a TOTP code
            profile=ComputeProfile(cpus=2, mem_gb=16, partition="shared"),
            vscode=VsCodeSettings(setup=FILE_KEYCHAIN,
                                  compute=ComputeProfile(cpus=2, mem_gb=8, time="08:00:00", partition="shared")),
        ),
    ]


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


def save(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(dumps(clusters), encoding="utf-8")
    tmp.replace(path)


@dataclass
class AppSettings:
    globus_client_id: str = ""  # your Globus native app id (app.globus.org/settings/developers)
    browser_profile: str = ""  # Chrome profile name for links (e.g. "Uni"); empty = system browser


def load_app(path: Path = APP_FILE) -> AppSettings:
    app = AppSettings()
    if path.exists():
        with open(path, "rb") as fh:
            _merge(app, tomllib.load(fh).get("app", {}))
    return app


def save_app(app: AppSettings, path: Path = APP_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["[app]"] + [f"{k} = {_toml_value(v)}" for k, v in asdict(app).items()]
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(path)
