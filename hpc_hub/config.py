"""Cluster settings in ~/.config/hpc-hub/clusters.toml. Never holds secrets."""

import json
import os
import tomllib
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "hpc-hub"
CONFIG_FILE = CONFIG_DIR / "clusters.toml"
APP_FILE = CONFIG_DIR / "app.toml"

VPN_PROTOCOLS = ["anyconnect", "gp", "nc", "pulse", "f5", "fortinet", "array"]


@dataclass
class VpnSettings:
    enabled: bool = False
    gateway: str = ""
    protocol: str = "anyconnect"
    useragent: str = ""
    authgroup: str = ""
    same_login_as_ssh: bool = True


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


@dataclass
class VsCodeSettings:
    command: str = ""  # alias from ~/.bashrc, picked on first run
    workdir: str = "~"
    open_links: bool = True


@dataclass
class ClaudeSettings:
    command: str = "claude"
    workdir: str = "~"
    skip_permissions: bool = False
    new_node: bool = False


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
    request_node_on_connect: bool = True
    reuse_running_job: bool = False
    vpn: VpnSettings = field(default_factory=VpnSettings)
    profile: ComputeProfile = field(default_factory=ComputeProfile)
    vscode: VsCodeSettings = field(default_factory=VsCodeSettings)
    claude: ClaudeSettings = field(default_factory=ClaudeSettings)
    globus: GlobusSettings = field(default_factory=GlobusSettings)

    @property
    def vpn_connection_name(self) -> str:
        return f"HPC Hub - {self.name}"


def default_clusters() -> list[ClusterConfig]:
    return [
        ClusterConfig(
            id="wulver",
            name="Wulver (NJIT)",
            host="wulver.njit.edu",
            vpn=VpnSettings(enabled=True, gateway="vpn.njit.edu"),
            profile=ComputeProfile(cpus=4, mem_gb=16),
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
            ),
            profile=ComputeProfile(cpus=2, mem_gb=16, partition="devel"),
        ),
        ClusterConfig(
            id="sdsc",
            name="SDSC Expanse",
            host="login.expanse.sdsc.edu",
            profile=ComputeProfile(cpus=2, mem_gb=16, partition="shared"),
        ),
    ]


def _merge(obj, data: dict):
    """Copy known keys from data onto a dataclass, keeping defaults for the rest."""
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
    for c in clusters:
        if isinstance(saved.get(c.id), dict):
            _merge(c, saved[c.id])
        c.host = c.host.strip().rpartition("@")[2]  # user@ belongs in the login
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
        tables = {k: data.pop(k) for k in list(data) if isinstance(data[k], dict)}
        out.append(f"[clusters.{c.id}]")
        out += [f"{k} = {_toml_value(v)}" for k, v in data.items()]
        for name, table in tables.items():
            out += ["", f"[clusters.{c.id}.{name}]"]
            out += [f"{k} = {_toml_value(v)}" for k, v in table.items()]
        out.append("")
    return "\n".join(out)


def save(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(dumps(clusters), encoding="utf-8")
    tmp.replace(path)


@dataclass
class AppSettings:
    globus_client_id: str = ""  # your Globus native app id (app.globus.org/settings/developers)


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
