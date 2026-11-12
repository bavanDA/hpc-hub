"""Yale Bouchet: NetID with an SSH key (added at Yale's key page), the VPN with a Microsoft sign-in."""

from ..backup.model import Purge
from ..core.cluster_settings import FILE_KEYCHAIN, TUNNEL, ClusterConfig, ComputeProfile, VpnSettings, VsCodeSettings
from .site import Site


def cluster() -> ClusterConfig:
    return ClusterConfig(
        id="yale",
        name="Yale Bouchet",
        short="Yale",
        org="Yale",
        host="bouchet.ycrc.yale.edu",
        username_label="NetID",
        key_page="https://sshkeys.ycrc.yale.edu/",
        key_page_note="That page only loads on campus or on the VPN.",
        key_help="https://docs.ycrc.yale.edu/clusters-at-yale/access/ssh/",
        reuse_running_job=True,
        paid_partitions="priority",  # public partitions (day, devel, gpu, week...) cost nothing
        vpn=VpnSettings(
            enabled=True,
            gateway="access.yale.edu",
            useragent="AnyConnect Linux_64 4.10.07061",
            authgroup="Default",
            same_login_as_ssh=False,  # Microsoft sign-in wants first.last@yale.edu
            domains="yale.edu",
            routes="130.132.0.0/16 128.36.0.0/16",
        ),
        profile=ComputeProfile(cpus=2, mem_gb=16, partition="devel"),
        vscode=VsCodeSettings(
            command=f"{TUNNEL} --name yale",
            setup=f"{FILE_KEYCHAIN}; module load VSCode",
            compute=ComputeProfile(cpus=2, mem_gb=15, time="06:00:00", partition="devel")),
    )


SITE = Site(
    # the docs say 30 in two places and 60 in one; getquota's Purged column decides at run time
    purge=Purge(days=30, basis="oldest", warns_by_email=True,
                source_url="https://docs.ycrc.yale.edu/clusters/bouchet/",
                quote="Files stored in scratch are purged if they are older than 30 days."),
    gpu_docs=(("rtx_5000_ada", "gpu"), ("a5000", "gpu"), ("a40", "gpu"), ("l40s", "gpu"), ("h100", "gpu_h100"),
              ("h200", "gpu_h200"), ("b200", "gpu_b200"), ("rtx_pro_6000_blackwell", "gpu_rtx6000")),
)
