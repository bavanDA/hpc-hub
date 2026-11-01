"""What the backup agent passes around. Sizes are bytes, days are whole days, times are epoch seconds."""

from dataclasses import dataclass, field

CLASSES = ("results", "code", "writing", "inputs", "logs", "regen", "checkpoint", "unsure")
LABELS = {"results": "Results", "code": "Code", "writing": "Writing and notes", "inputs": "Inputs and settings",
          "logs": "Logs", "regen": "Can be made again", "checkpoint": "Can be made again", "unsure": "Not sure"}
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
class Folder:
    path: str  # relative to scratch, up to 3 levels deep
    bytes: int = 0  # on disk
    apparent_bytes: int = 0
    files: int = 0
    at_risk_files: int = 0
    at_risk_bytes: int = 0
    soonest_days: int | None = None
    kind: str = "unsure"  # the class with the most at-risk bytes
    by_class: dict = field(default_factory=dict)  # class -> {files, bytes, at_risk_files, at_risk_bytes}
    git: bool = False
    busy: bool = False  # a running job works here
    links_out: int = 0
    sparse: int = 0
    hardlinks: int = 0
    biggest: list = field(default_factory=list)  # [path, bytes, class, days_left]


@dataclass
class Summary:
    id: str
    scratch: str
    started: int
    purge: Purge
    horizon_days: int
    files: int = 0
    bytes: int = 0
    at_risk_files: int = 0
    at_risk_bytes: int = 0
    soonest_days: int | None = None
    deadlines: list = field(default_factory=list)  # [{days, files, bytes}], at-risk files by days left
    folders: list = field(default_factory=list)  # [Folder]
    hardlinks: int = 0
    partial: bool = False
    scratch_fill_pct: int = 0


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
