"""The Skills page: what each agent knows on a cluster, HPC Hub's own skills, skills from a git repository."""

from pathlib import Path

from ...agents import skills
from ...agents.skills import TARGETS, Skill
from ..hub import hub
from ..server import method

_found: dict[str, dict[str, Skill]] = {}  # cluster: path -> skill, from the last repository you loaded


def _json(sk: Skill) -> dict:
    return {"path": sk.path, "folder": sk.folder, "name": sk.name, "description": sk.description,
            "target": sk.target, "managed": sk.managed}


def _targets(picked: list[str]) -> list[str]:
    unknown = [t for t in picked if t not in TARGETS]
    if unknown:
        raise ValueError(f"No agent {', '.join(unknown)}")
    if not picked:
        raise ValueError("Pick at least one agent")
    return list(dict.fromkeys(picked))


@method("skills.list")
def list_skills(cluster: str) -> dict:
    """The agents' skills on the cluster, and HPC Hub's own with the agents that have them (on)."""
    s = hub().connected(cluster)
    got = skills.installed(s.ssh)
    have: dict[str, set[str]] = {}
    for k in got:
        have.setdefault(k.folder, set()).add(k.target)
    return {"name": s.cfg.name,
            "targets": [{"id": t, "label": label, "folder": f"~/{rel}"} for t, (label, rel) in TARGETS.items()],
            "installed": [_json(k) for k in got],
            "catalog": [{**_json(k), "path": "", "on": [t for t in TARGETS if t in have.get(k.folder, set())]}
                        for k in skills.catalog()],
            "default_repo": skills.DEFAULT_REPO}


@method("skills.add")
def add(cluster: str, folder: str, targets: list[str]) -> None:
    """Copy one of HPC Hub's own skills to the agents' folders on the cluster."""
    picked = _targets(targets)
    sk = next((k for k in skills.catalog() if Path(k.path).name == folder), None)
    if not sk:
        raise ValueError(f"HPC Hub has no skill {folder}")
    skills.install_local(hub().connected(cluster).ssh, [sk], picked)


@method("skills.browse")
def browse(cluster: str, url: str) -> list[dict]:
    """Clone or update the repository on the cluster and list the skills in it."""
    found = skills.browse(hub().connected(cluster).ssh, url)
    _found[cluster] = {k.path: k for k in found}
    return [_json(k) for k in found]


@method("skills.install")
def install(cluster: str, paths: list[str], targets: list[str]) -> None:
    """Copy skills found by skills.browse (only those) to the agents' folders."""
    picked = _targets(targets)
    known = _found.get(cluster, {})
    chosen = [known[p] for p in dict.fromkeys(paths) if p in known]
    if not chosen or len(chosen) != len(set(paths)):
        raise ValueError("Load the repository again, then tick the skills")
    res = hub().connected(cluster).ssh.run(skills.install_command(chosen, picked), timeout=60)
    if res.returncode != 0:
        raise ValueError(res.stderr.strip() or "Could not copy the skills")


@method("skills.remove")
def remove(cluster: str, path: str, target: str) -> None:
    """Remove a skill you added; ones the agent manages itself stay."""
    s = hub().connected(cluster)
    sk = next((k for k in skills.installed(s.ssh) if k.path == path and k.target == target), None)
    if not sk:
        raise ValueError("That skill is not there any more")
    res = s.ssh.run(skills.remove_command(sk), timeout=30)
    if res.returncode != 0:
        raise ValueError(res.stderr.strip() or f"Could not remove {sk.name}")
