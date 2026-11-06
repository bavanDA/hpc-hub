"""What the backup passes around. Sizes are bytes, days whole days, times epoch seconds."""

from dataclasses import dataclass, field

CLASSES = ("results", "code", "writing", "inputs", "logs", "regen", "checkpoint", "unsure")
KEEP_BY_DEFAULT = ("results", "code", "writing", "inputs", "logs")


@dataclass
class Purge:
    days: int  # 0: scratch here has no timer
    basis: str = "oldest"  # oldest (earliest of atime, mtime, ctime), mtime, atime or created
    sooner_when_full_pct: int = 0  # Wulver: may delete sooner past this fill
    warns_by_email: bool = False
    source_url: str = ""
    quote: str = ""
    from_cluster: bool = False  # days read from the cluster at run time
    allocation_end: str = ""  # Expanse: project files go 90 days after this


@dataclass
class Destination:
    path: str  # a project (or home) folder; copies go to <path>/from-scratch
    label: str
    used_gb: float = 0
    quota_gb: float = 0  # 0: unknown
    free_gb: float = 0
    files: int = 0
    file_limit: int = 0
    shared_with: int = 0  # people in the group sharing it
    backed_up: bool = False


@dataclass
class Item:
    folder: str
    kind: str  # a class
    keep: bool
    files: int
    bytes: int
    why: str = ""
    by: str = "rule"  # rule, agent or you


@dataclass
class Space:
    dest: str
    before_gb: float
    after_gb: float
    quota_gb: float
    pct_after: int
    files_after: int = 0
    file_limit: int = 0
    fits: bool = True
    warn: str = ""


@dataclass
class Plan:
    scan_id: str
    dest: str  # .../from-scratch
    horizon_days: int
    scope: str  # "at_risk" or "everything"
    items: list = field(default_factory=list)  # [Item] kept
    left_out: list = field(default_factory=list)  # [Item]
    files: int = 0
    bytes: int = 0
    exact: bool = False  # True after the trial run
    space: Space | None = None
    agent_summary: str = ""
    rules: list = field(default_factory=list)  # what the copy job's filter keeps
    hash: str = ""


@dataclass
class Progress:
    state: str
    done_bytes: int = 0
    total_bytes: int = 0
    files_done: int = 0
    files_total: int = 0
    eta_s: int = 0
    resubmits: int = 0
    detail: str = ""


@dataclass
class Result:
    copied_files: int = 0
    bytes: int = 0
    verified: str = ""  # checksum or quick
    mismatches: int = 0
    busy: list = field(default_factory=list)  # paths that changed in the last 30 minutes, left for later
    failed: list = field(default_factory=list)  # [{path, why}]
    notes_path: str = ""
