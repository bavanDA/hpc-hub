"""Load and save clusters.toml and app.toml in ~/.config/hpc-hub. Never holds secrets."""

import os
import tomllib
from dataclasses import asdict
from pathlib import Path

from ..clusters import default_clusters
from .app_settings import APPEARANCES, EXPERIMENTS, AppSettings
from .cluster_settings import (
    CHROME_WINDOW,
    LATEX_ENGINES,
    TUNNEL,
    VPN_PROTOCOLS,
    AgentSettings,
    ClusterConfig,
    ComputeProfile,
    GlobusSettings,
    LatexSettings,
    VpnSettings,
    VsCodeSettings,
    short_time,
)
from .toml_file import merge, table, toml_value, write_atomic

__all__ = [
    "APPEARANCES", "APP_FILE", "CHROME_WINDOW", "CONFIG_DIR", "CONFIG_FILE", "EXPERIMENTS", "LATEX_ENGINES",
    "TUNNEL", "VPN_PROTOCOLS", "AgentSettings", "AppSettings", "ClusterConfig", "ComputeProfile",
    "GlobusSettings", "LatexSettings", "VpnSettings", "VsCodeSettings", "chosen", "default_clusters", "dumps",
    "first_run", "load", "load_app", "save", "save_app", "save_chosen", "short_time",
]

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "hpc-hub"
CONFIG_FILE = CONFIG_DIR / "clusters.toml"
APP_FILE = CONFIG_DIR / "app.toml"


def load(path: Path = CONFIG_FILE) -> list[ClusterConfig]:
    clusters = default_clusters()
    if not path.exists():
        return clusters
    with open(path, "rb") as fh:
        saved = tomllib.load(fh).get("clusters", {})
    for c, default in zip(clusters, default_clusters()):
        if isinstance(saved.get(c.id), dict):
            merge(c, saved[c.id])
        _tidy(c, default)
    return clusters


def _tidy(c: ClusterConfig, default: ClusterConfig) -> None:
    c.host = c.host.strip().rpartition("@")[2]  # user@ belongs in the login
    c.vscode.command = c.vscode.command or default.vscode.command  # old configs saved an empty alias
    if c.vpn.browser not in ("", CHROME_WINDOW):  # a Chrome profile's name, from before: the app's window
        c.vpn.browser = ""


def dumps(clusters: list[ClusterConfig]) -> str:
    out = ["# HPC Hub settings. Passwords live in GNOME Keyring, not here.", ""]
    for c in clusters:
        data = asdict(c)
        data.pop("id")
        table(out, f"clusters.{c.id}", data)
        out.append("")
    return "\n".join(out)


def save(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    write_atomic(path, dumps(clusters))


def chosen(clusters: list[ClusterConfig], app: AppSettings) -> list[ClusterConfig]:
    """Only the clusters you said you use (all of them if you never chose)."""
    ids = [i for i in app.clusters.split(",") if i]
    return [c for c in clusters if c.id in ids] if ids else clusters


def save_chosen(clusters: list[ClusterConfig], path: Path = CONFIG_FILE) -> None:
    """Save the clusters you use without losing the settings of those you turned off."""
    mine = {c.id: c for c in clusters}
    save([mine.get(c.id, c) for c in load(path)], path)


def first_run(app: AppSettings, path: Path = CONFIG_FILE) -> bool:
    """Nothing saved yet: time to ask which clusters you use."""
    return not path.exists() and not app.clusters


def load_app(path: Path = APP_FILE) -> AppSettings:
    app = AppSettings()
    if path.exists():
        with open(path, "rb") as fh:
            data = tomllib.load(fh).get("app", {})
        if "experimental" in data:  # one switch for all three before; saving drops it
            data = {**{k: data["experimental"] for k in EXPERIMENTS}, **data}
        merge(app, data)
    if app.appearance not in APPEARANCES:
        app.appearance = "system"
    return app


def save_app(app: AppSettings, path: Path = APP_FILE) -> None:
    lines = ["[app]"] + [f"{k} = {toml_value(v)}" for k, v in asdict(app).items()]
    write_atomic(path, "\n".join(lines) + "\n")
