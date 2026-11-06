"""A compute profile as Slurm options, and the checks before it is sent."""

import re
import shlex

from ..core.config import ComputeProfile
from . import gpus
from .slurm import SlurmError

SAFE = re.compile(r"^[A-Za-z0-9_.,:=+-]*$")
TIME = re.compile(r"^(\d+-)?\d{1,2}(:\d{2}){0,2}$")


def validate(p: ComputeProfile) -> list[str]:
    errors = []
    if p.cpus < 1:
        errors.append("Cores must be at least 1")
    if p.mem_gb < 1:
        errors.append("Memory must be at least 1 GB")
    if not TIME.match(p.time):
        errors.append("Time must look like 04:00:00 or 1-00:00:00")
    for label, value in (("Queue", p.partition), ("Account", p.account), ("Billing", p.qos),
                         ("GPU type", p.gpu_type)):
        if not SAFE.match(value):
            errors.append(f"{label} has invalid characters")
    try:
        shlex.split(p.extra_args)
    except ValueError:
        errors.append("Extra arguments have unbalanced quotes")
    return errors


def resource_args(p: ComputeProfile) -> list[str]:
    # one task on one node, said out loud: Expanse refuses jobs that leave them to the defaults
    args = ["--nodes=1", "--ntasks=1", f"--cpus-per-task={p.cpus}", f"--mem={p.mem_gb}G", f"--time={p.time}"]
    if p.partition:
        args.append(f"--partition={p.partition}")
    if p.account:
        args.append(f"--account={p.account}")
    if p.qos:
        args.append(f"--qos={p.qos}")
    if p.gpus:
        args.append(gpus.gres_arg(p.gpu_type, p.gpus))
    return args + shlex.split(p.extra_args)


def checked(p: ComputeProfile) -> None:
    """Raise SlurmError with every problem of the profile."""
    errors = validate(p)
    if errors:
        raise SlurmError("; ".join(errors))
