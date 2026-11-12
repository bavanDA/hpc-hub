"""SDSC Expanse: an ACCESS login (password or SSH key from the portal), then a code from an authenticator app."""

from ..backup.model import Purge
from ..core.cluster_settings import FILE_KEYCHAIN, ClusterConfig, ComputeProfile, VsCodeSettings
from .site import Site


def cluster() -> ClusterConfig:
    return ClusterConfig(
        id="sdsc",
        name="SDSC Expanse",
        short="SDSC",
        org="SDSC",
        username_label="ACCESS username",
        host="login.expanse.sdsc.edu",
        second_factor="code",  # ACCESS login: ACCESS password or SSH key, then a TOTP code
        portal="https://portal.expanse.sdsc.edu",
        key_login=True,
        code_setup="https://passive.sdsc.edu",
        billing_per_su=3600,
        profile=ComputeProfile(cpus=2, mem_gb=16, partition="shared"),
        vscode=VsCodeSettings(setup=FILE_KEYCHAIN,
                              compute=ComputeProfile(cpus=2, mem_gb=8, time="08:00:00", partition="shared")),
    )


SITE = Site(
    purge=Purge(days=90, basis="created",
                source_url="https://www.sdsc.edu/systems/expanse/user_guide.html",
                quote="Scratch files will be purged 90 days from creation date."),
    gpu_docs=(("", "gpu-shared"), ("", "gpu"), ("", "gpu-debug")),
    untyped_gpu=("V100", 32),  # Expanse lists its GPUs without a type
    scan_args="--constraint=lustre",  # only nodes that see its Lustre scratch
    code_sign_in="Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login.",
)
