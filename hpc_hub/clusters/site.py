"""What one cluster does its own way, beyond the settings you can change (ClusterConfig). Kept in code, never in
your clusters.toml, so a fix here reaches everyone. Every field is optional: a new cluster may need none."""

from dataclasses import dataclass

from ..backup.model import Purge


@dataclass(frozen=True)
class Site:
    purge: Purge | None = None  # the scratch purge rule its docs give (Backup)
    gpu_docs: tuple[tuple[str, str], ...] = ()  # (gres type, queue) its docs list, until a sign-in reads Slurm
    untyped_gpu: tuple[str, int] | None = None  # name and GB of the GPUs Slurm lists without a type
    scan_args: str = ""  # extra sbatch arguments for Backup's scan job
    help_email: str = ""  # the help desk it publishes
    code_sign_in: str = ""  # how to sign in on its authenticator setup page (code_setup)
