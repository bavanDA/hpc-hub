"""Everything a cluster's settings dialog changes, like the GTK app's settings.py: second step, server and VPN,
compute node defaults and queues, the VS Code job, and the agents' options. Only these fields, each checked
(text is one line; extra Slurm arguments must be options, so nothing can become a command); a change with any
error saves nothing. Logins go through clusters.set_login."""

import copy
import re
import shlex
from dataclasses import asdict, fields, replace

from ...agents.catalog import AGENTS, BY_ID
from ...compute import slurm
from ...connect import chrome_window
from ...connect.vpn import split_errors
from ...core.config import VPN_PROTOCOLS, ComputeProfile
from ..hub import hub
from ..server import method

FACTORS = ("duo", "code")
TARGETS = ("desktop", "browser")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
HOST = re.compile(r"[A-Za-z0-9.-]*")
GATEWAY = re.compile(r"(https://)?[A-Za-z0-9.-]+(:\d{1,5})?(/[A-Za-z0-9._~/+-]*)?")
NAME = re.compile(r"[A-Za-z0-9_.-]+")
GROUP = re.compile(r"[A-Za-z0-9 _.-]*")
NUMBERS = {"cpus": (1, 512), "mem_gb": (1, 4096), "gpus": (0, 16)}
TOP = {"host", "port", "second_factor", "duo_answer", "request_node_on_connect", "ask_node", "reuse_running_job",
       "queues",
       "queue_wait", "vpn", "profile", "vscode", *BY_ID}
VPN = {"enabled", "gateway", "protocol", "useragent", "authgroup", "same_login_as_ssh", "split_tunnel", "domains",
       "routes", "browser"}
VSCODE = {"setup", "command", "workdir", "open_links", "open_in", "compute"}


def _known(changes, allowed: set[str], where: str) -> dict:
    if not isinstance(changes, dict):
        raise ValueError(f"{where} must be a set of settings")
    unknown = set(changes) - allowed
    if unknown:
        raise ValueError(f"Can't change {', '.join(sorted(unknown))}{' in ' + where if where else ''}")
    return changes


def _text(v, label: str, limit: int = 500) -> str:
    if not isinstance(v, str):
        raise ValueError(f"{label} must be text")
    if CONTROL.search(v):
        raise ValueError(f"{label} must be one line")
    v = v.strip()
    if len(v) > limit:
        raise ValueError(f"{label} is too long")
    return v


def _bool(v, label: str) -> bool:
    if not isinstance(v, bool):
        raise ValueError(f"{label} must be on or off")
    return v


def _int(v, label: str, low: int, high: int) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or not low <= v <= high:
        raise ValueError(f"{label} must be a whole number from {low} to {high}")
    return v


def _match(v, label: str, pattern: re.Pattern, limit: int = 200) -> str:
    v = _text(v, label, limit)
    if v and not pattern.fullmatch(v):
        raise ValueError(f"{label} has characters it can't have")
    return v


def _profile(p: ComputeProfile, changes, label: str) -> ComputeProfile:
    _known(changes, {f.name for f in fields(ComputeProfile)}, label)
    clean = {}
    for k, v in changes.items():
        clean[k] = _int(v, f"{label}: {k}", *NUMBERS[k]) if k in NUMBERS else _text(v, f"{label}: {k}")
    p = replace(p, **clean)
    errors = slurm.validate(p)
    if not errors and any(not a.startswith("-") for a in shlex.split(p.extra_args)):
        # salloc would run a word that is not an option as a command
        errors.append("Extra arguments must all be options, like --constraint=gpu")
    if errors:
        raise ValueError(f"{label}: {'. '.join(errors)}")
    return p


def _queues(v) -> str:
    v = _text(v, "Queues")
    out = []
    for item in (x.strip() for x in v.split(",")):
        part, _, qos = (x.strip() for x in item.partition(":"))
        if not item:
            continue
        if not (NAME.fullmatch(part) and NAME.fullmatch(qos)):
            raise ValueError(f"Queues: {item} is not partition:qos")
        out.append(f"{part}:{qos}")
    return ",".join(out)


def _vpn(v, changes, windows: list[str]) -> None:
    _known(changes, VPN, "VPN")
    for k, x in changes.items():
        if k in ("enabled", "same_login_as_ssh", "split_tunnel"):
            setattr(v, k, _bool(x, f"VPN {k}"))
        elif k == "gateway":
            v.gateway = _match(x, "VPN gateway", GATEWAY)
        elif k == "protocol":
            if x not in VPN_PROTOCOLS:
                raise ValueError(f"No VPN protocol {x}")
            v.protocol = x
        elif k == "useragent":
            v.useragent = _text(x, "User agent", 200)
        elif k == "authgroup":
            v.authgroup = _match(x, "VPN group", GROUP, 100)
        elif k in ("domains", "routes"):
            setattr(v, k, " ".join(_text(x, f"VPN {k}", 1000).split()))
        elif k == "browser":
            name = _text(x, "Sign in with", 100)
            if name and name != v.browser and name not in windows:
                raise ValueError(f"Can't sign in with {name}")
            v.browser = name


def _agent(a, agent_id: str, changes) -> None:
    agent = BY_ID[agent_id]
    options = {o.key: o for o in agent.options}
    _known(changes, {"new_node", "remote", "workdir", *options}, agent.name)
    for k, x in changes.items():
        if k in ("new_node", "remote"):
            setattr(a, k, _bool(x, f"{agent.name} {k}"))
        elif k == "workdir":
            a.workdir = _text(x, f"{agent.name} folder") or "~"
        elif x not in [value for value, _ in options[k].choices]:
            raise ValueError(f"{agent.name}: {options[k].label} can't be {x}")
        else:
            setattr(a, k, x)


def apply(cfg, changes: dict, windows: list[str]):
    """A checked copy of cfg with the changes; ValueError (and cfg untouched) at the first problem. windows: the
    sign-in windows besides the app's own (our Chrome window, where there is Chrome)."""
    _known(changes, TOP, "")
    c = copy.deepcopy(cfg)
    for k, x in changes.items():
        if k == "host":
            c.host = _match(_text(x, "Login host").rpartition("@")[2], "Login host", HOST)  # user@ is the login's
        elif k == "port":
            c.port = _int(x, "SSH port", 1, 65535)
        elif k == "second_factor":
            if x not in FACTORS:
                raise ValueError(f"No second step {x}")
            c.second_factor = x
        elif k == "duo_answer":
            c.duo_answer = _match(x, "Duo answer", NAME, 20) or "push"
        elif k in ("request_node_on_connect", "ask_node", "reuse_running_job"):
            setattr(c, k, _bool(x, k))
        elif k == "queues":
            c.queues = _queues(x)
        elif k == "queue_wait":
            c.queue_wait = _int(x, "Queue wait (seconds)", 0, 3600)
        elif k == "vpn":
            _vpn(c.vpn, x, windows)
        elif k == "profile":
            c.profile = _profile(c.profile, x, "Compute node")
        elif k == "vscode":
            _known(x, VSCODE, "VS Code")
            for vk, vx in x.items():
                if vk == "compute":
                    c.vscode.compute = _profile(c.vscode.compute, vx, "VS Code job")
                elif vk == "open_links":
                    c.vscode.open_links = _bool(vx, "Open automatically")
                elif vk == "open_in":
                    if vx not in TARGETS:
                        raise ValueError(f"VS Code can't open in {vx}")
                    c.vscode.open_in = vx
                else:
                    setattr(c.vscode, vk, _text(vx, f"VS Code {vk}", 1000))
            c.vscode.workdir = c.vscode.workdir or "~"
        else:
            _agent(getattr(c, k), k, x)
    if not c.vscode.command:
        raise ValueError("VS Code command is empty")
    if c.vpn.enabled and not c.vpn.gateway:
        raise ValueError("VPN gateway is empty")
    errors = split_errors(c)
    if errors:
        raise ValueError(". ".join(errors))
    return c


@method("cluster_settings.get")
def get(cluster: str) -> dict:
    """The cluster's settings, whether our Chrome window is there to sign in with, and each agent's options (no
    secrets)."""
    cfg = hub().session(cluster).cfg
    return {"cluster": asdict(cfg), "protocols": VPN_PROTOCOLS,
            "chrome_window": {"value": chrome_window.CHOICE, "offered": chrome_window.available()},
            "agents": [{"id": a.id, "name": a.name, "remote_label": a.remote_label, "remote_hint": a.remote_hint,
                        "options": [{"key": o.key, "label": o.label, "choices": [list(c) for c in o.choices]}
                                    for o in a.options]} for a in AGENTS]}


@method("cluster_settings.save")
def save(cluster: str, changes: dict) -> dict:
    """Check every change, then save them all; answers the cluster's settings."""
    cfg = hub().session(cluster).cfg
    new = apply(cfg, changes, [chrome_window.CHOICE] if chrome_window.available() else [])
    for f in fields(cfg):  # the session keeps this same object
        setattr(cfg, f.name, getattr(new, f.name))
    hub().save_clusters()
    return asdict(cfg)
