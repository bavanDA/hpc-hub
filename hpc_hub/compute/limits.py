"""What a job may ask for and what it costs, read from Slurm and kept on disk for before you connect."""

import json
import re
from dataclasses import asdict, dataclass, field, replace

from ..core.config import ComputeProfile
from ..core.paths import log_dir
from . import gpus

FETCH = ("sinfo -h -o '%P|%l|%c|%m'; echo @QOS; "
         "sacctmgr -nP show qos format=name,maxwall,maxtres,maxtrespu,usagefactor 2>/dev/null; "
         "echo @ASSOC; sacctmgr -nP show assoc user=\"$USER\" format=account,qos,defaultqos 2>/dev/null; "
         "echo @USER; sacctmgr -nP show user \"$USER\" format=defaultaccount 2>/dev/null; "
         "echo @GRES; sinfo -h -o '%P|%G' 2>/dev/null; "
         "echo @PARTS; scontrol show partition -o 2>/dev/null; "
         "echo @FLAGS; scontrol show config 2>/dev/null | grep -i '^PriorityFlags'; true")
RULES = ("AllowQos", "DenyQos", "AllowAccounts", "DenyAccounts", "QoS", "MaxNodes", "DefaultTime", "DefMemPerCPU",
         "OverSubscribe", "PreemptMode", "TotalNodes", "State")  # kept from scontrol show partition
SLURM_TIME = re.compile(r"^(?:(\d+)-)?(\d+)(?::(\d+))?(?::(\d+))?$")


def minutes(text: str) -> int | None:
    """A Slurm time as minutes: '3-00:00:00' -> 4320, '8:00:00' -> 480, '30' -> 30. None = no limit."""
    m = SLURM_TIME.match(text.strip())
    if not m:
        return None
    days, a, b, c = (int(x) if x else None for x in m.groups())
    if days is not None:  # D-H, D-H:M, D-H:M:S
        return days * 1440 + a * 60 + (b or 0) + (1 if c else 0)
    if c is not None:  # H:M:S
        return a * 60 + b + (1 if c else 0)
    if b is not None:  # M:S
        return a + (1 if b else 0)
    return a  # M


def slurm_time(total: int) -> str:
    """Minutes as a Slurm time: 90 -> 01:30:00, 1830 -> 1-06:30:00."""
    days, rest = divmod(max(int(total), 1), 1440)
    h, m = divmod(rest, 60)
    return f"{days}-{h:02d}:{m:02d}:00" if days else f"{h:02d}:{m:02d}:00"


def human(total: int) -> str:
    """4320 -> '3 days', 1830 -> '1 day 6 h 30 min'."""
    days, rest = divmod(int(total), 1440)
    h, m = divmod(rest, 60)
    parts = ([f"{days} day{'s' if days != 1 else ''}"] if days else []) + ([f"{h} h"] if h else []) + (
        [f"{m} min"] if m else [])
    return " ".join(parts) or "0 min"


@dataclass
class Limits:
    partitions: dict[str, int | None] = field(default_factory=dict)  # None = no limit
    default_partition: str = ""
    qos: dict[str, int | None] = field(default_factory=dict)
    allowed_qos: list[str] = field(default_factory=list)  # the QoS your account may use
    default_qos: str = ""
    account_qos: dict[str, list[str]] = field(default_factory=dict)  # each group you may bill -> its QoS
    default_account: str = ""
    gres: dict[str, list[str]] = field(default_factory=dict)  # partition -> GPU gres ("gpu:a100_10g:2")
    gpu_only: list[str] = field(default_factory=list)  # partitions whose nodes all have GPUs: a job there needs one
    cores: dict[str, int] = field(default_factory=dict)  # partition -> cores of its biggest node
    memory_gb: dict[str, int] = field(default_factory=dict)  # partition -> memory of its biggest node
    mem_per_core_mb: dict[str, int] = field(default_factory=dict)  # partition -> MaxMemPerCPU: more memory, more cores
    qos_caps: dict[str, dict[str, int]] = field(default_factory=dict)  # qos -> {"cpu": 4, "mem": GB, "gpu:l40": 0}
    billing: dict[str, dict[str, float]] = field(default_factory=dict)  # partition -> SUs an hour per cpu, GB, GPU
    billing_max: str = ""  # PriorityFlags: "" adds the weighted cores, memory and GPUs; "all" takes the biggest;
    #                        "gres" takes the bigger of cores and memory, then adds the GPUs
    usage_factor: dict[str, float] = field(default_factory=dict)  # qos -> what its SUs count (low: 0, free)
    qos_per_job: dict[str, dict[str, int]] = field(default_factory=dict)  # qos -> caps on one job
    qos_per_user: dict[str, dict[str, int]] = field(default_factory=dict)  # qos -> caps on all your jobs together
    rules: dict[str, dict[str, str]] = field(default_factory=dict)  # partition -> scontrol's words about it

    def usable_qos(self, partition: str) -> list[str]:
        """The QoS you may use on this partition."""
        rules = self.rules.get(partition, {})
        allow, deny = rules.get("AllowQos", "ALL").split(","), rules.get("DenyQos", "").split(",")
        return [q for q in self.allowed_qos if ("ALL" in allow or q in allow) and q not in deny]

    def needs_gpu(self, partition: str) -> bool:
        """A queue of GPU nodes only (Wulver's gpu): a job there that asks for no GPU is refused."""
        return (partition or self.default_partition) in self.gpu_only

    def qos_choices(self, partition: str, account: str = "") -> list[str]:
        """The priorities to offer for a job here: your group's that this partition takes."""
        mine = self.account_qos.get(account) or self.allowed_qos
        usable = self.usable_qos(partition or self.default_partition)
        return [q for q in mine if q in usable]

    def refused_qos(self, partition: str, qos: str, account: str = "") -> str:
        """Why a job with this priority (empty: your default) would wait forever on this partition, "" if it can run.
        Unknown limits say nothing: Slurm decides."""
        part, q = partition or self.default_partition, qos or self.default_qos
        if not q or not self.allowed_qos or q in self.usable_qos(part):
            return ""
        choices = self.qos_choices(part, account)
        if choices:
            return f"The {part} queue takes priority {' or '.join(choices)}, not {q}."
        return f"Your account can't use the {part} queue."

    def pick_qos(self, partition: str, qos: str = "") -> str:
        """The QoS to read limits from: the one named, else your default, or the first this partition takes when it
        refuses your default."""
        usable = self.usable_qos(partition)
        refused = self.default_qos and usable and self.default_qos not in usable
        return qos or (usable[0] if refused else self.default_qos)

    def caps(self, partition: str, qos: str = "") -> dict[str, int]:
        """What the QoS and the partition's own QoS let one job have."""
        out = dict(self.qos_caps.get(self.pick_qos(partition, qos), {}))
        for k, v in self.qos_caps.get(self.rules.get(partition, {}).get("QoS", ""), {}).items():
            out[k] = min(v, out.get(k, v))
        return out

    def biggest(self, partition: str, qos: str = "") -> tuple[int | None, int | None]:
        """Cores and GB one job may ask for: the partition's biggest node, cut by the QoS's caps. None = unknown."""
        part = partition or self.default_partition
        caps = self.caps(part, qos)
        cores, mem = self.cores.get(part), self.memory_gb.get(part)
        if "cpu" in caps:
            cores = min(cores, caps["cpu"]) if cores else caps["cpu"]
        if "mem" in caps:
            mem = min(mem, caps["mem"]) if mem else caps["mem"]
        return cores, mem

    def gpu_caps(self, qos: str = "") -> dict[str, int]:
        """The QoS's GPU caps: {"": 1} for any GPU, {"l40": 0} for a type it doesn't allow."""
        caps = self.qos_caps.get(qos or self.default_qos, {})
        return {k[4:]: v for k, v in caps.items() if k == "gpu" or k.startswith("gpu:")}

    def billing_for(self, partition: str, qos: str = "") -> dict | None:
        """What an hour costs here, for the app to work out as you type: the weights (SUs per core, per GB, per GPU
        by type; "gpu" for any), how they add up, and the QoS's factor (0: free). None where Slurm sets no weights."""
        part = partition or self.default_partition
        weights = self.billing.get(part)
        if not weights:
            return None
        return {"weights": weights, "max": self.billing_max,
                "factor": self.usage_factor.get(self.pick_qos(part, qos), 1.0)}

    def longest(self, partition: str, qos: str) -> tuple[int | None, str]:
        """The longest time a job may ask for, and what sets it ('QoS standard'). (None, '') = no limit."""
        part = partition or self.default_partition
        caps = []
        if self.partitions.get(part):
            caps.append((self.partitions[part], f"partition {part}"))
        own = self.rules.get(part, {}).get("QoS", "")
        if self.qos.get(own):
            caps.append((self.qos[own], f"partition {part}"))
        q = self.pick_qos(part, qos)
        if not q:  # Slurm picks one: assume the most generous one you may use
            usable = [(self.qos.get(x) or 0, x) for x in self.allowed_qos if self.qos.get(x)]
            q = max(usable)[1] if usable else ""
        if self.qos.get(q):
            caps.append((self.qos[q], f"QoS {q}"))
        return min(caps) if caps else (None, "")

    def fit(self, p: ComputeProfile) -> tuple[ComputeProfile, str]:
        """The profile with its time cut to the longest allowed, and a note when it was cut."""
        top, why = self.longest(p.partition, p.qos)
        asked = minutes(p.time)
        if top and asked and asked > top:
            return replace(p, time=slurm_time(top)), f"Time cut from {human(asked)} to {human(top)} ({why} limit)"
        return p, ""


def _number(text: str) -> int:
    """sinfo's '128' or '64+' (nodes of 64 and more) -> 128, 64; anything else 0."""
    m = re.match(r"\d+", text.strip())
    return int(m.group()) if m else 0


MB = {"K": 0, "M": 1, "G": 1024, "T": 1024 * 1024}  # Slurm's memory units in MB (no unit: MB)


def _tres(text: str) -> dict[str, int]:
    """'cpu=4,mem=16G,gres/gpu:l40=0' -> {"cpu": 4, "mem": 16, "gpu:l40": 0} (mem in GB)."""
    out = {}
    for item in text.split(","):
        key, _, value = item.partition("=")
        m = re.match(r"(\d+)([KMGT]?)", value)
        if not key or not m:
            continue
        n = int(m.group(1))
        if key == "mem":
            out["mem"] = n * MB.get(m.group(2), 1) // 1024
        elif key in ("cpu", "node"):
            out[key] = n
        elif key.startswith("gres/gpu"):
            out[key[5:]] = n
    return out


def _weights(text: str) -> dict[str, float]:
    """'CPU=1.0,Mem=0.25G,GRES/gpu=0,gres/gpu:a100=16.0' -> {"cpu": 1, "mem": 0.25, "gpu": 0, "gpu:a100": 16}, mem
    per GB. A node's weight, where whole nodes are billed, is under "node"."""
    out = {}
    for item in text.split(","):
        key, _, value = item.partition("=")
        m = re.fullmatch(r"([\d.]+)([KMGT]?)", value.strip())
        if not m:
            continue
        key, n = key.strip().lower(), float(m.group(1))
        if key == "mem":
            out["mem"] = n * 1024 * 1024 if m.group(2) == "K" else n * 1024 / MB[m.group(2) or "M"]  # no unit: per MB
        elif key in ("cpu", "node"):
            out[key] = n
        elif key.startswith("gres/gpu"):
            out[key[5:]] = n
    return out


def parse(text: str) -> Limits:
    out = Limits()
    section = "part"
    gres_lines = []
    for line in text.splitlines():
        if line in ("@QOS", "@ASSOC", "@USER", "@GRES", "@PARTS", "@FLAGS"):
            section = line[1:].lower()
            continue
        if section == "gres":
            gres_lines.append(line)
            continue
        cells = line.strip().split("|")
        if section == "part" and len(cells) in (2, 4) and cells[0]:
            name = cells[0].rstrip("*")
            out.partitions[name] = minutes(cells[1])
            if cells[0].endswith("*"):
                out.default_partition = name
            if len(cells) == 4:  # one line per kind of node: keep the biggest
                cores, mb = _number(cells[2]), _number(cells[3])
                if cores:
                    out.cores[name] = max(cores, out.cores.get(name, 0))
                if mb:
                    out.memory_gb[name] = max(mb // 1024, out.memory_gb.get(name, 0))
        elif section == "qos" and len(cells) in (2, 4, 5) and cells[0]:
            out.qos[cells[0]] = minutes(cells[1]) if cells[1] else None
            if len(cells) == 5 and re.fullmatch(r"[\d.]+", cells[4]):
                out.usage_factor[cells[0]] = float(cells[4])
            caps: dict[str, int] = {}
            for tres, kept in zip(cells[2:4], (out.qos_per_job, out.qos_per_user)):  # the smaller one counts
                if _tres(tres):
                    kept[cells[0]] = _tres(tres)
                for k, v in _tres(tres).items():
                    caps[k] = min(v, caps.get(k, v))
            if caps:
                out.qos_caps[cells[0]] = caps
        elif section == "parts":
            words = dict(w.partition("=")[::2] for w in line.split())
            name = words.get("PartitionName", "")
            if not name:
                continue
            out.rules[name] = {k: words[k] for k in RULES if k in words}
            if words.get("MaxMemPerCPU", "UNLIMITED").isdigit():
                out.mem_per_core_mb[name] = int(words["MaxMemPerCPU"])
            if words.get("TRESBillingWeights"):
                out.billing[name] = _weights(words["TRESBillingWeights"])
            if words.get("MaxMemPerNode", "").isdigit() and name in out.memory_gb:  # Slurm keeps some for the system
                out.memory_gb[name] = min(out.memory_gb[name], int(words["MaxMemPerNode"]) // 1024)
            if words.get("MaxCPUsPerNode", "").isdigit() and name in out.cores:
                out.cores[name] = min(out.cores[name], int(words["MaxCPUsPerNode"]))
        elif section == "flags":
            flags = line.partition("=")[2].replace(" ", "").upper().split(",")
            out.billing_max = "gres" if "MAX_TRES_GRES" in flags else "all" if "MAX_TRES" in flags else ""
        elif section == "assoc" and len(cells) in (2, 3):
            account, qos, default = cells if len(cells) == 3 else ("", *cells)
            mine = [q for q in qos.split(",") if q]
            if account:
                out.account_qos.setdefault(account, [])
                out.account_qos[account] += [q for q in mine if q not in out.account_qos[account]]
            out.allowed_qos += [q for q in mine if q not in out.allowed_qos]
            out.default_qos = out.default_qos or default
        elif section == "user" and cells[0]:
            out.default_account = cells[0]
    out.gres = gpus.parse("\n".join(gres_lines))
    out.gpu_only = _gpu_only(gres_lines)
    return out


def _file(cluster_id: str):
    return log_dir() / f"limits-{cluster_id}.json"


def fetch(ssh, cluster_id: str) -> Limits:
    limits = parse(ssh.read(FETCH, timeout=30).stdout)
    if limits.partitions:
        _file(cluster_id).write_text(json.dumps(asdict(limits)))
    return limits


def cached(cluster_id: str) -> Limits | None:
    try:
        return Limits(**json.loads(_file(cluster_id).read_text()))
    except (OSError, ValueError, TypeError):
        return None


def _gpu_only(gres_lines: list[str]) -> list[str]:
    """Partitions where every kind of node has a GPU ("%P|%G" lines; "(null)" is a node without)."""
    every: dict[str, bool] = {}
    for line in gres_lines:
        part, _, gres = line.strip().partition("|")
        if part:
            name = part.rstrip("*")
            every[name] = every.get(name, True) and "gpu" in gres and "(null)" not in gres
    return [p for p, yes in every.items() if yes]
