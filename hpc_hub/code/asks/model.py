"""One ask: what is asked about which file, and where it lives on the cluster."""

import posixpath
import re
import secrets
import time
from dataclasses import asdict, dataclass, field

ROOT = ".hpc-hub/asks"  # under $HOME
SESSION_PREFIX = "hpchub-ask-"
KINDS = ("explain", "fix", "test", "free")
ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")


@dataclass
class Ask:
    id: str
    agent: str  # catalog id
    agent_name: str
    kind: str
    path: str  # the file, as the user gave it (~/x or /abs)
    question: str = ""
    error_text: str = ""
    from_line: int = 0  # 1-based, inclusive; 0 = the whole file
    to_line: int = 0
    node: str = ""
    started: float = field(default_factory=time.time)

    @property
    def folder(self) -> str:
        return f"~/{ROOT}/{self.id}"

    @property
    def session(self) -> str:
        return SESSION_PREFIX + self.id

    def meta(self) -> dict:
        return {k: v for k, v in asdict(self).items() if k not in ("question", "error_text")}


def new_id(now: float | None = None) -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "-" + secrets.token_hex(2)


def check_id(ask_id: str) -> str:
    if not ID.match(ask_id or ""):
        raise ValueError("That ask id looks wrong")
    return ask_id


def where(a: Ask) -> str:
    """'train.py, lines 40 to 58' / 'train.py'."""
    name = posixpath.basename(a.path.rstrip("/")) or a.path
    if a.from_line and a.to_line and a.to_line != a.from_line:
        return f"{name}, lines {a.from_line} to {a.to_line}"
    if a.from_line:
        return f"{name}, line {a.from_line}"
    return name
