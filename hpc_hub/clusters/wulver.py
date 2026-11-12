"""NJIT Wulver: UCID and password, then Duo; the VPN off campus."""

from ..backup.model import Purge
from ..core.cluster_settings import FILE_KEYCHAIN, TUNNEL, ClusterConfig, ComputeProfile, VpnSettings, VsCodeSettings
from .site import Site


def cluster() -> ClusterConfig:
    return ClusterConfig(
        id="wulver",
        name="Wulver (NJIT)",
        short="Wulver",
        org="NJIT",
        username_label="UCID",
        host="wulver.njit.edu",
        password_only=True,  # its sshd offers no publickey, only a password (or Kerberos), then Duo
        vpn=VpnSettings(enabled=True, gateway="vpn.njit.edu", useragent="AnyConnect Linux_64 4.10.07061",
                        domains="njit.edu", routes="128.235.0.0/16"),
        profile=ComputeProfile(cpus=4, mem_gb=16),
        vscode=VsCodeSettings(
            command=f"$HOME/vscode_cli/{TUNNEL}", setup=f"{FILE_KEYCHAIN}; module purge; module load wulver",
            compute=ComputeProfile(cpus=16, mem_gb=64, time="12:00:00", partition="general", qos="standard")),
    )


SITE = Site(
    purge=Purge(days=30, basis="oldest", sooner_when_full_pct=80, warns_by_email=True,
                source_url="https://hpc.njit.edu/clusters/Wulver_filesystems/",
                quote="Files are deleted from /scratch after they are 30 days old."),
    gpu_docs=(("a100_10g", "gpu"), ("a100_20g", "gpu"), ("a100_40g", "gpu"), ("a100", "gpu"), ("l40", "gpu")),
    help_email="hpc@njit.edu",
)
