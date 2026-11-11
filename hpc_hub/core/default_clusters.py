"""The clusters HPC Hub knows out of the box."""

from .cluster_settings import TUNNEL, ClusterConfig, ComputeProfile, VpnSettings, VsCodeSettings

# keep the GitHub sign-in in $HOME, so a tunnel on a new node does not ask again
FILE_KEYCHAIN = "export VSCODE_CLI_USE_FILE_KEYCHAIN=1 VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT=1"


def default_clusters() -> list[ClusterConfig]:
    clusters = [
        ClusterConfig(
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
        ),
        ClusterConfig(
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
        ),
        ClusterConfig(
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
        ),
    ]
    for c in clusters:
        c.ask_node = True  # new users see the node's size before each request, so they can change it
    return clusters
