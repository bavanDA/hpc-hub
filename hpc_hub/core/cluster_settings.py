"""The settings of one cluster, as saved in clusters.toml."""

from dataclasses import dataclass, field

LATEX_ENGINES = ["pdf", "xelatex", "lualatex"]
VPN_PROTOCOLS = ["anyconnect", "gp", "nc", "pulse", "f5", "fortinet", "array"]
CHROME_WINDOW = "hpc-hub:chrome-window"  # vpn.browser: sign in in HPC Hub's own Chrome window (chrome_window.py)


@dataclass
class VpnSettings:
    enabled: bool = False
    gateway: str = ""
    protocol: str = "anyconnect"
    useragent: str = ""
    authgroup: str = ""
    same_login_as_ssh: bool = True
    split_tunnel: bool = True  # only the networks/domains below use the VPN
    domains: str = ""  # DNS domains answered by the VPN's DNS, space separated
    routes: str = ""  # networks sent through the VPN, space separated CIDRs
    browser: str = ""  # where the web sign-in happens: "" = the app's own window, CHROME_WINDOW = our Chrome window


def short_time(t: str) -> str:
    """"4 h", "30 min", "1 d 12 h" for Slurm's "04:00:00", "00:30:00", "1-12:00:00"."""
    days, _, hms = t.rpartition("-")
    h, m = ((int(x) if x.isdigit() else 0) for x in (hms.split(":") + ["0", "0"])[:2])
    d = int(days) if days.isdigit() else 0
    return " ".join(p for p in (f"{d} d" if d else "", f"{h} h" if h else "", f"{m} min" if m else "") if p) or t


@dataclass
class ComputeProfile:
    cpus: int = 2
    mem_gb: int = 16
    time: str = "04:00:00"
    partition: str = ""
    account: str = ""
    qos: str = ""
    gpus: int = 0
    gpu_type: str = ""  # Slurm's gres type (a100_10g, h100); "" = any GPU (compute/gpus.py)
    extra_args: str = ""

    def summary(self) -> str:
        """"4 cores · 16 GB · 4 h": the size, not the queue."""
        parts = [f"{self.cpus} core{'' if self.cpus == 1 else 's'}", f"{self.mem_gb} GB", short_time(self.time)]
        if self.gpus:
            from ..compute.gpus import describe
            name = describe(self.gpu_type)[0] if self.gpu_type else "GPU"
            parts.append(name if self.gpus == 1 and self.gpu_type else f"{self.gpus} × {name}")
        return " · ".join(parts)


TUNNEL = "code tunnel --accept-server-license-terms"


def _vscode_compute() -> ComputeProfile:
    return ComputeProfile(cpus=2, mem_gb=8, time="08:00:00")


@dataclass
class VsCodeSettings:
    """VS Code runs as its own batch job (sbatch), separate from the compute node."""
    command: str = TUNNEL
    setup: str = ""  # runs first, e.g. "module load VSCode"
    workdir: str = "~"
    open_links: bool = True
    open_in: str = "desktop"  # desktop (VS Code app) or browser (vscode.dev)
    ask: bool = True  # off: VS Code starts with these choices, no window first
    compute: ComputeProfile = field(default_factory=_vscode_compute)


@dataclass
class AgentSettings:
    """Claude, ChatGPT (codex), Antigravity (agy) or Cursor (cursor-agent) on a compute node."""
    command: str = "claude"
    workdir: str = "~"
    new_node: bool = False
    remote: bool = False
    # per-agent choices, "" = the agent's default (see agents.py for which agent uses which)
    model: str = ""
    mode: str = ""
    effort: str = ""
    sandbox: str = ""
    approval: str = ""
    minutes: int = 0  # older configs: time on a new node; 0 = the cluster's usual time
    compute: ComputeProfile = field(default_factory=lambda: ComputeProfile(cpus=0))  # cpus 0 = not picked yet


@dataclass
class LatexSettings:
    setup: str = ""  # e.g. "module load TeXLive" before building
    engine: str = "pdf"  # pdf, xelatex, lualatex
    on_node: bool = True


@dataclass
class GlobusSettings:
    collection_id: str = ""
    collection_name: str = ""


@dataclass
class ClusterConfig:
    id: str
    name: str
    host: str = ""
    port: int = 22
    duo_answer: str = "push"
    second_factor: str = "duo"  # duo (push to your phone) or code (authenticator app, TOTP)
    remember_password: bool = True  # False: the keyring keeps only the username; asked once per run
    org: str = ""  # who runs it, for copy like "NJIT doesn't support SSH keys yet"
    short: str = ""  # the name after the first mention on a screen ("Yale" for "Yale Bouchet"); "" = from name
    portal: str = ""  # web portal where you can add your SSH key after signing in in Chrome
    key_page: str = ""  # a web page where you paste your SSH public key yourself (Yale's key uploader)
    key_page_note: str = ""  # what to know about that page, shown under its button
    key_help: str = ""  # a guide to SSH keys for this cluster ("What's an SSH key?"); "" = GitHub's
    ssh_key: str = ""  # the private key to sign in with, picked by you; "" = the ones ssh tries by itself
    username_label: str = "Username"  # what the cluster calls it: UCID, NetID
    password_only: bool = False  # its SSH server takes no keys: the app needs your password (said, not hidden)
    password_too: bool = False  # with key_page: a password works as well, offered as "Use a password instead"
    key_login: bool = False  # takes SSH keys from ~/.ssh/authorized_keys: the phone app gets a key (pairing.py)
    code_setup: str = ""  # where you set up the authenticator app the cluster asks codes from
    paid_partitions: str = ""  # only partitions starting with these (space separated) are billed; "" = all (Yale)
    billing_per_su: int = 1  # Slurm's billing number for 1 SU an hour; Expanse counts SU-seconds, so 3600
    request_node_on_connect: bool = True
    ask_node: bool = False  # with request_node_on_connect: show the node's settings first instead of asking Slurm
    reuse_running_job: bool = True  # a node you already have is used before asking for one
    vpn: VpnSettings = field(default_factory=VpnSettings)
    profile: ComputeProfile = field(default_factory=ComputeProfile)
    vscode: VsCodeSettings = field(default_factory=VsCodeSettings)
    claude: AgentSettings = field(default_factory=AgentSettings)
    codex: AgentSettings = field(default_factory=lambda: AgentSettings(command="codex"))
    agy: AgentSettings = field(default_factory=lambda: AgentSettings(command="agy"))
    cursor: AgentSettings = field(default_factory=lambda: AgentSettings(command="cursor-agent"))
    globus: GlobusSettings = field(default_factory=GlobusSettings)
    latex: LatexSettings = field(default_factory=LatexSettings)

    def paid(self, partition: str) -> bool:
        """Whether jobs on this partition are billed (Yale bills only its priority partitions)."""
        prefixes = self.paid_partitions.split()
        return not prefixes or any(partition.startswith(p) for p in prefixes)

    @property
    def short_name(self) -> str:
        """"Wulver", "Yale", "SDSC": its short field, else the name without "(NJIT)"."""
        return self.short.strip() or self.name.split(" (")[0]

    @property
    def who(self) -> str:
        """"Yale": the org, else the short name, for copy like "Yale uses an SSH key"."""
        return self.org or self.short_name

    @property
    def vpn_connection_name(self) -> str:
        return f"HPC Hub - {self.name}"
