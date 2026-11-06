"""Agent skills on a cluster. Folders the agents manage themselves (MANAGED) are listed but never removed."""

import re
import shlex
from dataclasses import dataclass
from pathlib import Path

from ..core.ssh import SshMaster
from ..files import remote_fs

TARGETS = {"claude": ("Claude", ".claude/skills"), "codex": ("ChatGPT", ".codex/skills"),
           "cursor": ("Cursor", ".cursor/skills"), "agy": ("Antigravity", ".gemini/config/skills")}
CATALOG = Path(__file__).parent / "skill_catalog"
MANAGED = ("/synced/", "/.system/")
REPOS = ".hpc-hub/skill-repos"
DEFAULT_REPO = "https://github.com/mattpocock/skills.git"

# prints: path|name|description for every SKILL.md under the given folders
SCAN = r"""for base in "$@"; do
  [ -d "$base" ] || continue
  find -L "$base" -maxdepth 6 -name SKILL.md -not -path '*/.git/*' 2>/dev/null | sort | while IFS= read -r f; do
    awk -v path="$(dirname "$f")" 'NR==1 && $0!="---" {bad=1; exit} /^---/ {n++; if (n==2) exit; next}
      /^name:/ {sub(/^name: */, ""); name=$0} /^description:/ {sub(/^description: */, ""); desc=$0}
      END {if (!bad) {gsub(/^"|"$/, "", desc); print path "|" name "|" desc}}' "$f"
  done
done"""


@dataclass
class Skill:
    path: str  # its folder
    name: str
    description: str = ""
    target: str = ""  # claude / codex for installed ones
    managed: bool = False  # synced or built in: leave it alone

    @property
    def folder(self) -> str:
        return self.path.rstrip("/").rsplit("/", 1)[-1]


def parse(text: str, target: str = "") -> list[Skill]:
    out = []
    for line in text.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3 and parts[0].startswith("/"):
            path, name, desc = parts
            out.append(Skill(path, name or path.rsplit("/", 1)[-1], desc.strip(), target,
                             any(m in path + "/" for m in MANAGED)))
    return out


def _scan(ssh: SshMaster, folders: list[str]) -> str:
    return ssh.run(f"bash -c {shlex.quote(SCAN)} _ " + " ".join(folders), timeout=60).stdout


def installed(ssh: SshMaster) -> list[Skill]:
    out = []
    for target, (_, rel) in TARGETS.items():
        out += parse(_scan(ssh, [f'"$HOME"/{rel}']), target)
    return out


def repo_folder(url: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "-", re.sub(r"^https?://|\.git$", "", url.strip())).strip("-")
    return f'"$HOME"/{REPOS}/{shlex.quote(slug or "repo")}'


def browse(ssh: SshMaster, url: str) -> list[Skill]:
    if not re.match(r"^(https://|git@)[\w.@:/~-]+$", url.strip()):
        raise ValueError("Use an https:// or git@ address of a git repository")
    d = repo_folder(url)
    get = (f"if [ -d {d}/.git ]; then git -C {d} pull -q --ff-only; "
           f"else mkdir -p \"$HOME\"/{REPOS} && git clone -q --depth 1 {shlex.quote(url.strip())} {d}; fi")
    res = ssh.run(f"timeout 120 bash -c {shlex.quote(get)}", timeout=150, fast=True)
    if res.returncode != 0:
        raise ValueError(res.stderr.strip() or "Could not get the repository")
    return parse(_scan(ssh, [d]))


def install_command(skills: list[Skill], targets: list[str]) -> str:
    """Copy each skill folder into each agent's skills folder (replacing an older copy)."""
    steps = []
    for t in targets:
        dest = f'"$HOME"/{TARGETS[t][1]}'
        steps.append(f"mkdir -p {dest}")
        for sk in skills:
            name = shlex.quote(sk.folder)
            steps.append(f"rm -rf {dest}/{name} && cp -r {shlex.quote(sk.path)} {dest}/{name}")
    return " && ".join(steps)


def front_matter(text: str) -> dict[str, str]:
    """name/description from a SKILL.md header (the part between the first two --- lines)."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    out = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, value = line.partition(":")
        if sep and key.strip() in ("name", "description"):
            out[key.strip()] = value.strip().strip('"')
    return out


def catalog(folder: Path = CATALOG) -> list[Skill]:
    out = []
    for f in sorted(folder.glob("*/SKILL.md")):
        meta = front_matter(f.read_text(encoding="utf-8", errors="replace"))
        out.append(Skill(str(f.parent), meta.get("name") or f.parent.name, meta.get("description", "")))
    return out


def install_local(ssh: SshMaster, picked: list[Skill], targets: list[str]) -> None:
    for t in targets:
        dest = f"{ssh.run('echo $HOME').stdout.strip()}/{TARGETS[t][1]}"
        names = " ".join(shlex.quote(f"{dest}/{Path(sk.path).name}") for sk in picked)
        res = ssh.run(f"mkdir -p {shlex.quote(dest)} && rm -rf {names}")
        if res.returncode != 0:
            raise ValueError(res.stderr.strip() or f"Could not prepare {dest}")
        for sk in picked:
            remote_fs.upload(ssh, sk.path, dest)


def remove_command(skill: Skill) -> str:
    if skill.managed or not skill.target:
        raise ValueError(f"{skill.name} is managed by the agent itself")
    return f'rm -rf "$HOME"/{TARGETS[skill.target][1]}/{shlex.quote(skill.folder)}'
