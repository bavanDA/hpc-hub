import re
from dataclasses import dataclass

from ...core.ssh import SshMaster
from .sections import sections

LOAD = r"""echo @PART; sinfo -h -o '%P|%a|%D|%C'
echo @GPU; sinfo -h -N -O 'partition:|,gres:|,gresused:|'
echo @PEND; squeue -h -t PENDING -o %P | sort | uniq -c
echo @RUN; squeue -h -t RUNNING -o %P | sort | uniq -c"""


@dataclass
class Partition:
    name: str
    up: bool
    nodes: int
    cpus_used: int
    cpus_total: int
    gpus_used: int = 0
    gpus_total: int = 0
    running: int = 0
    pending: int = 0


def _gpus(spec: str) -> int:
    """'gpu:a100_40g:4,gpu:a100_20g:1(IDX:4)' -> 5"""
    return sum(int(m) for m in re.findall(r"gpu:[^:,]+:(\d+)", spec))


def parse_load(text: str) -> list[Partition]:
    sec = sections(text)
    parts: dict[str, Partition] = {}
    for line in sec.get("PART", []):
        p = line.split("|")
        if len(p) != 4:
            continue
        cpu = p[3].split("/")  # allocated/idle/other/total
        name = p[0].rstrip("*")
        if len(cpu) == 4 and all(c.isdigit() for c in cpu) and p[2].isdigit():
            parts[name] = Partition(name, p[1] == "up", int(p[2]), int(cpu[0]), int(cpu[3]))
    for line in sec.get("GPU", []):
        p = line.split("|")
        part = parts.get(p[0].strip().rstrip("*")) if p else None
        if part and len(p) >= 3:
            part.gpus_total += _gpus(p[1])
            part.gpus_used += _gpus(p[2])
    for key, attr in (("PEND", "pending"), ("RUN", "running")):
        for line in sec.get(key, []):
            p = line.split()
            if len(p) == 2 and p[0].isdigit() and p[1] in parts:
                setattr(parts[p[1]], attr, int(p[0]))
    return list(parts.values())


def load(ssh: SshMaster) -> list[Partition]:
    return parse_load(ssh.run(LOAD, timeout=60).stdout)
