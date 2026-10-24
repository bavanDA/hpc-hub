"""Which commands Claude may run on a cluster without asking: the Bash allow list in ~/.claude/settings.json,
plus HPC Hub's guard hook (rm goes to trash, some commands always ask) and the trash command."""

import base64
import json
import re
import shlex
from dataclasses import dataclass, field
from pathlib import Path

from ..core.ssh import SshMaster

FILES = Path(__file__).parent / "guard_files"
SETTINGS = ".claude/settings.json"
GUARD = ".claude/hooks/guard.py"
GUARD_CONF = ".claude/hooks/guard.json"
TRASH = ".local/bin/trash"
CLAUDE_MD = ".claude/CLAUDE.md"
TRASH_NOTE = ("# Deleting files\nNever use rm. Use `trash <paths>` (same flags as rm); it keeps files for 7 days "
              "in a .trash folder. `trash --list` shows them.\n")

GROUPS = [
    ("Read and search", "Only look at files and the system", """grep rg head tail cat less ls cd pwd echo printf sed
        awk cut sort uniq wc nl tr diff cmp comm paste column tac find which type file stat du df realpath readlink
        basename dirname date seq sleep true test env printenv export source hostname nproc lscpu free ps pgrep
        ulimit md5sum sha256sum strings ldd od xxd jq tree zcat"""),
    ("Files", "Make, copy, move and pack files", "mkdir cp mv ln touch tee chmod rmdir zip unzip tar gzip gunzip "
                                                 "xargs timeout"),
    ("Code and builds", "A script can do anything your account can", "python3 python bash sh make cmake gcc g++ nvcc "
                                                                      "gdb perf"),
    ("LaTeX and PDF", "", "pdflatex latexmk bibtex biber pdftotext pdfinfo pdftoppm"),
    ("Slurm", "Submitting uses your group's SUs", "squeue sacct sinfo sacctmgr sreport sstat seff sshare sprio "
                                                  "scontrol sbatch srun module ml quota"),
    ("Git", "Force push still asks if that is on below", "git gh"),
    ("Network", "Download, copy to and log in to other machines", "ssh scp rsync curl wget"),
    ("Processes and agents", "", "kill pkill codex claude"),
]
GROUPS = [(title, note, cmds.split()) for title, note, cmds in GROUPS]
KNOWN = {c for _, _, cmds in GROUPS for c in cmds}
ASKS = [("scancel", "Cancel jobs (scancel)"), ("force_push", "Force push (git push --force)"),
        ("discard", "Throw away changes (git reset --hard, git clean -f)")]
RULE = re.compile(r"^Bash\(([^:() ]+):\*\)$")


@dataclass
class Permissions:
    allowed: set[str] = field(default_factory=set)  # program names
    trash: bool = True  # rm is blocked, trash is used instead
    ask: set[str] = field(default_factory=lambda: {k for k, _ in ASKS})
    accept_edits: bool = True  # Claude edits files without asking
    settings: dict = field(default_factory=dict)  # the whole settings.json, kept as is apart from our keys

    @property
    def custom(self) -> list[str]:
        return sorted(self.allowed - KNOWN)


def defaults() -> set[str]:
    return set(KNOWN)


def parse(settings_text: str, guard_text: str) -> Permissions:
    try:
        settings = json.loads(settings_text) if settings_text.strip() else {}
    except ValueError:
        settings = {}
    perm = settings.get("permissions") or {}
    allowed = {m.group(1) for r in perm.get("allow", []) if (m := RULE.match(r))}
    try:
        guard = json.loads(guard_text) if guard_text.strip() else None
    except ValueError:
        guard = None
    has_hook = GUARD.split("/")[-1] in json.dumps(settings.get("hooks", {}))
    if not has_hook:  # never set up by HPC Hub: start from the suggested list
        return Permissions(allowed=allowed or defaults(), accept_edits=True, settings=settings)
    return Permissions(allowed=allowed, trash=bool(guard.get("trash", True)) if guard else True,
                       ask=set(guard.get("ask", [])) if guard else {k for k, _ in ASKS},
                       accept_edits=perm.get("defaultMode") == "acceptEdits", settings=settings)


def apply(p: Permissions) -> dict:
    """settings.json with our choices; rules and keys we don't manage are kept."""
    s = json.loads(json.dumps(p.settings))
    perm = s.setdefault("permissions", {})
    ours = lambda r: bool(RULE.match(r))  # noqa: E731
    allowed = set(p.allowed) | ({"trash"} if p.trash else set())
    perm["allow"] = [r for r in perm.get("allow", []) if not ours(r)] + [f"Bash({c}:*)" for c in sorted(allowed)]
    deny = [r for r in perm.get("deny", []) if r != "Bash(rm:*)"]
    perm["deny"] = deny + (["Bash(rm:*)"] if p.trash else [])
    managed_ask = {"Bash(scancel:*)", "Bash(git push --force:*)", "Bash(git push -f:*)"}
    ask = [r for r in perm.get("ask", []) if r not in managed_ask]
    if "scancel" in p.ask:
        ask.append("Bash(scancel:*)")
    if "force_push" in p.ask:
        ask += ["Bash(git push --force:*)", "Bash(git push -f:*)"]
    perm["ask"] = ask
    if p.accept_edits:
        perm["defaultMode"] = "acceptEdits"
    elif perm.get("defaultMode") == "acceptEdits":
        del perm["defaultMode"]
    pre = s.setdefault("hooks", {}).setdefault("PreToolUse", [])
    pre[:] = [h for h in pre if "guard.py" not in json.dumps(h)]
    pre.append({"matcher": "Bash", "hooks": [{"type": "command", "command": f"python3 ~/{GUARD}"}]})
    return s


SET_KEY = """import json, os, sys
p = os.path.expanduser("~/.claude/settings.json")
try:
    s = json.load(open(p))
except (OSError, ValueError):
    s = {}
s[sys.argv[1]] = json.loads(sys.argv[2])
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump(s, open(p + ".new", "w"), indent=2)
os.replace(p + ".new", p)
"""


def set_key_command(key: str, value) -> str:
    """Set one top-level key in Claude's settings.json, keeping the rest."""
    return f"python3 -c {shlex.quote(SET_KEY)} {shlex.quote(key)} {shlex.quote(json.dumps(value))}"


def set_key(ssh: SshMaster, key: str, value) -> None:
    res = ssh.run(set_key_command(key, value))
    if res.returncode != 0:
        raise OSError(res.stderr.strip() or f"could not set {key}")


def read(ssh: SshMaster) -> Permissions:
    res = ssh.run(f"cat ~/{SETTINGS} 2>/dev/null; echo; echo @@HPCHUB@@; cat ~/{GUARD_CONF} 2>/dev/null; true")
    if res.returncode != 0:
        raise OSError(res.stderr.strip() or "could not read the settings")
    settings_text, _, guard_text = res.stdout.partition("@@HPCHUB@@")
    return parse(settings_text, guard_text)


def _write(path: str, text: str, mode: str = "") -> str:
    data = base64.b64encode(text.encode()).decode()
    line = f"echo {data} | base64 -d > ~/{path}.new && mv ~/{path}.new ~/{path}"
    return line + (f" && chmod {mode} ~/{path}" if mode else "")


def save_command(p: Permissions) -> str:
    guard = {"trash": p.trash, "ask": sorted(p.ask)}
    steps = [
        "mkdir -p ~/.claude/hooks ~/.local/bin",
        f"cp ~/{SETTINGS} ~/{SETTINGS}.bak 2>/dev/null; true",
        _write(SETTINGS, json.dumps(apply(p), indent=2) + "\n"),
        _write(GUARD, (FILES / "guard.py").read_text(), "+x"),
        _write(GUARD_CONF, json.dumps(guard) + "\n"),
        _write(TRASH, (FILES / "trash").read_text(), "+x"),
    ]
    if p.trash:  # tell Claude once, in every project
        note = shlex.quote(TRASH_NOTE)
        steps.append(f"grep -qs 'Use `trash' ~/{CLAUDE_MD} || printf '\\n%s' {note} >> ~/{CLAUDE_MD}")
    return " && ".join(steps)


def save(ssh: SshMaster, p: Permissions) -> None:
    res = ssh.run(save_command(p), timeout=60)
    if res.returncode != 0:
        raise OSError(res.stderr.strip() or "could not save the settings")
