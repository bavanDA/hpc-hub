"""The GPUs a cluster offers, read from Slurm (sinfo's gres column, fetched with the limits at login), with names
people know: "A100, 10 GB slice" for Wulver's MIG gres a100_10g. Before the first login the docs' list stands in.

Sources: hpc.njit.edu/MIG/job-submission-and-su-charges (a100_10g/20g/40g, one MIG slice per job, partition gpu);
docs.ycrc.yale.edu/clusters/bouchet (types by partition, --gpus=type:count); SDSC Expanse user guide (V100 32 GB,
untyped --gpus=N on gpu, gpu-shared, gpu-debug).
"""

import re
from dataclasses import asdict, dataclass, field

# gres type -> (name, memory in GB). A slice (MIG) is a part of one GPU.
KNOWN: dict[str, tuple[str, int]] = {
    "a100": ("A100", 80), "a100_10g": ("A100, 10 GB slice", 10), "a100_20g": ("A100, 20 GB slice", 20),
    "a100_40g": ("A100, 40 GB slice", 40), "a100_80gb": ("A100", 80), "v100": ("V100", 32),
    "h100": ("H100", 80), "h200": ("H200", 141), "b200": ("B200", 193), "l40s": ("L40S", 48), "a40": ("A40", 48),
    "a5000": ("RTX A5000", 24), "rtx_5000_ada": ("RTX 5000 Ada", 32),
    "rtx_pro_6000_blackwell": ("RTX PRO 6000 Blackwell", 96),
}
SLICE = re.compile(r"_(\d+)g(b)?$")  # a100_10g: a MIG slice of 10 GB
GRES = re.compile(r"gpu(?::([A-Za-z0-9_.-]+))?:(\d+)")

# What the docs list, used until the first login reads the real thing (cluster id -> [(type, partition)])
DOCS: dict[str, list[tuple[str, str]]] = {
    "wulver": [("a100_10g", "gpu"), ("a100_20g", "gpu"), ("a100_40g", "gpu"), ("a100", "gpu")],
    "yale": [("rtx_5000_ada", "gpu"), ("a5000", "gpu"), ("a40", "gpu"), ("l40s", "gpu"), ("h100", "gpu_h100"),
             ("h200", "gpu_h200"), ("b200", "gpu_b200"), ("rtx_pro_6000_blackwell", "gpu_rtx6000")],
    "sdsc": [("", "gpu-shared"), ("", "gpu"), ("", "gpu-debug")],
}
UNTYPED_NAME = {"sdsc": ("V100", 32)}


@dataclass
class Gpu:
    type: str  # the gres type ("" when the cluster names none)
    label: str
    memory_gb: int  # 0 = not known
    slice: bool  # part of one GPU (MIG): one per job
    partitions: list[str] = field(default_factory=list)
    max_per_job: int = 1


def parse(text: str) -> dict[str, list[str]]:
    """sinfo -h -o '%P|%G' lines -> partition -> gres entries ("gpu:a100_10g:2"). '(null)' and non-GPU ones go."""
    out: dict[str, list[str]] = {}
    for line in text.splitlines():
        part, _, gres = line.strip().partition("|")
        part = part.rstrip("*")
        if not part:
            continue
        for g in re.split(r",(?=gpu)", gres):  # "gpu:a100:4(S:0-1),gpu:a100_10g:2"
            g = g.split("(")[0].strip()
            if g.startswith("gpu") and g not in out.setdefault(part, []):
                out[part].append(g)
    return {p: v for p, v in out.items() if v}


def describe(gtype: str, untyped: tuple[str, int] | None = None) -> tuple[str, int, bool]:
    """(label, memory GB, is a slice) for a gres type."""
    if gtype in KNOWN:
        name, mem = KNOWN[gtype]
    elif not gtype:
        name, mem = untyped or ("GPU", 0)
    else:
        name, mem = gtype.replace("_", " ").upper(), 0
    m = SLICE.search(gtype)
    is_slice = bool(m) and gtype not in ("a100_80gb",)
    if m and gtype not in KNOWN:
        mem = int(m.group(1))
        name = f"{gtype[:m.start()].upper()}, {mem} GB slice"
    return name, mem, is_slice


def options(gres: dict[str, list[str]], cluster_id: str = "") -> list[Gpu]:
    """One entry per GPU type, with the partitions that have it; slices first, smallest first."""
    found: dict[str, Gpu] = {}
    for part, entries in gres.items():
        for e in entries:
            m = GRES.match(e)
            if not m:
                continue
            gtype, count = m.group(1) or "", int(m.group(2))
            label, mem, is_slice = describe(gtype, UNTYPED_NAME.get(cluster_id))
            g = found.setdefault(gtype, Gpu(gtype, label, mem, is_slice))
            if part not in g.partitions:
                g.partitions.append(part)
            g.max_per_job = 1 if is_slice else max(g.max_per_job, count)
    return sorted(found.values(), key=lambda g: (not g.slice, g.memory_gb or 999, g.label))


def from_docs(cluster_id: str) -> list[Gpu]:
    gres: dict[str, list[str]] = {}
    for gtype, part in DOCS.get(cluster_id, []):
        gres.setdefault(part, []).append(f"gpu:{gtype}:4" if gtype else "gpu:4")
    return options(gres, cluster_id)


def amount(tres: str, cluster_id: str = "") -> str:
    """A job's GPUs from Slurm's TRES ("gres/gpu=2,gres/gpu:a100=2") in words: "2 × A100", "A100, 10 GB slice"."""
    typed = re.findall(r"gres/gpu:([A-Za-z0-9_.-]+)=(\d+)", tres)
    plain = re.findall(r"gres/gpu=(\d+)", tres)
    found = [(t, int(n)) for t, n in typed] or [("", int(n)) for n in plain]
    out = []
    for gtype, n in found:
        name, _, is_slice = describe(gtype, UNTYPED_NAME.get(cluster_id))
        out.append(name if n == 1 and is_slice else f"{n} × {name}")
    return ", ".join(out)


def gres_arg(gtype: str, count: int) -> str:
    """The Slurm option for count GPUs of a type ("" type: any GPU)."""
    return f"--gres=gpu:{gtype}:{count}" if gtype else f"--gres=gpu:{count}"


def as_json(gpus: list[Gpu]) -> list[dict]:
    return [asdict(g) for g in gpus]
