"""How long a job may run: the partition's and the QoS's time limits, read from Slurm and kept on disk
so the settings know them before you connect."""

import json
import re
from dataclasses import asdict, dataclass, field, replace

from ..core.config import ComputeProfile
from ..core.paths import log_dir
from . import gpus

FETCH = ("sinfo -h -o '%P|%l|%c|%m'; echo @QOS; sacctmgr -nP show qos format=name,maxwall 2>/dev/null; "
         "echo @ASSOC; sacctmgr -nP show assoc user=\"$USER\" format=qos,defaultqos 2>/dev/null; "
         "echo @GRES; sinfo -h -o '%P|%G' 2>/dev/null; true")
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
    gres: dict[str, list[str]] = field(default_factory=dict)  # partition -> GPU gres ("gpu:a100_10g:2")
    cores: dict[str, int] = field(default_factory=dict)  # partition -> cores of its biggest node
    memory_gb: dict[str, int] = field(default_factory=dict)  # partition -> memory of its biggest node

    def biggest(self, partition: str) -> tuple[int | None, int | None]:
        """Cores and GB of the partition's biggest node: the most one job there can ask for. None = unknown."""
        part = partition or self.default_partition
        return self.cores.get(part), self.memory_gb.get(part)

    def longest(self, partition: str, qos: str) -> tuple[int | None, str]:
        """The longest time a job may ask for, and what sets it ('QoS standard'). (None, '') = no limit."""
        part = partition or self.default_partition
        caps = []
        if self.partitions.get(part):
            caps.append((self.partitions[part], f"partition {part}"))
        q = qos or self.default_qos
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


def parse(text: str) -> Limits:
    out = Limits()
    section = "part"
    gres_lines = []
    for line in text.splitlines():
        if line in ("@QOS", "@ASSOC", "@GRES"):
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
        elif section == "qos" and len(cells) == 2 and cells[0]:
            out.qos[cells[0]] = minutes(cells[1]) if cells[1] else None
        elif section == "assoc" and len(cells) == 2:
            for q in cells[0].split(","):
                if q and q not in out.allowed_qos:
                    out.allowed_qos.append(q)
            out.default_qos = out.default_qos or cells[1]
    out.gres = gpus.parse("\n".join(gres_lines))
    return out


def _file(cluster_id: str):
    return log_dir() / f"limits-{cluster_id}.json"


def fetch(ssh, cluster_id: str) -> Limits:
    """Blocking: ask Slurm, remember the answer."""
    limits = parse(ssh.run(FETCH, timeout=30).stdout)
    if limits.partitions:
        _file(cluster_id).write_text(json.dumps(asdict(limits)))
    return limits


def cached(cluster_id: str) -> Limits | None:
    try:
        return Limits(**json.loads(_file(cluster_id).read_text()))
    except (OSError, ValueError, TypeError):
        return None
