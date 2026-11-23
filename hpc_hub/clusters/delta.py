"""NCSA Delta (ACCESS): your NCSA username and NCSA (Kerberos) password, then NCSA Duo. SSH keys are off for general
use, and no VPN. Facts from https://docs.ncsa.illinois.edu/systems/delta/en/latest/ (2026-11-23)."""

from ..backup.model import Purge
from ..core.cluster_settings import FILE_KEYCHAIN, ClusterConfig, ComputeProfile, VsCodeSettings
from .site import Site

DOCS = "https://docs.ncsa.illinois.edu/systems/delta/en/latest/user_guide/"


def cluster() -> ClusterConfig:
    return ClusterConfig(
        id="delta",
        name="NCSA Delta",
        short="Delta",
        org="NCSA",
        username_label="NCSA username",
        host="login.delta.ncsa.illinois.edu",  # "Preferred hostname" (login.html)
        password_only=True,  # "Use of SSH key pairs is disabled for general use" (login.html)
        # jobs need an allocation account (accounts lists yours); the CPU queue, as the docs' examples
        profile=ComputeProfile(cpus=4, mem_gb=16, partition="cpu"),
        vscode=VsCodeSettings(setup=FILE_KEYCHAIN,
                              compute=ComputeProfile(cpus=4, mem_gb=16, time="08:00:00", partition="cpu")),
    )


SITE = Site(
    # /work/hdd "is now your scratch volume", and the table says Purged: No for it
    purge=Purge(days=0, source_url=DOCS + "data_mgmt.html"),
    # the docs ask GPUs by count (--gpus-per-node), per queue: 4 x A100, 4 x A40, 8 x A100, 8 x H200
    gpu_docs=(("", "gpuA100x4"), ("", "gpuA40x4"), ("", "gpuA100x8"), ("", "gpuH200x8")),
    help_email="help@ncsa.illinois.edu",
)
