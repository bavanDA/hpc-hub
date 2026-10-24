import pytest

from hpc_hub.agents import skills
from hpc_hub.api import hub as hub_mod
from hpc_hub.api.methods import skills as m
from hpc_hub.core.config import ClusterConfig
from tests.helpers import LocalShell


class Session:
    def __init__(self):
        self.cfg, self.ssh = ClusterConfig("wulver", "Wulver"), LocalShell()


class FakeHub:
    def __init__(self):
        self.session = Session()

    def connected(self, cluster):
        if cluster != "wulver":
            raise RuntimeError("Connect to Yale first")
        return self.session


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(hub_mod, "_hub", FakeHub())
    m._found.clear()
    return tmp_path


def skill(folder, name, desc="Does a thing."):
    folder.mkdir(parents=True)
    (folder / "SKILL.md").write_text(f"---\nname: {name}\ndescription: {desc}\n---\nbody\n")


def test_list_shows_installed_and_catalog(home):
    skill(home / ".claude/skills/tdd", "tdd")
    skill(home / ".claude/skills/synced/notes", "notes")
    got = m.list_skills("wulver")
    assert got["name"] == "Wulver" and [t["id"] for t in got["targets"]] == list(skills.TARGETS)
    assert got["targets"][0]["folder"] == "~/.claude/skills"
    mine = {k["name"]: k for k in got["installed"]}
    assert not mine["tdd"]["managed"] and mine["notes"]["managed"] and mine["tdd"]["target"] == "claude"
    cat = {k["folder"]: k for k in got["catalog"]}
    assert cat["tdd"]["on"] == ["claude"] and cat["code-review"]["on"] == [] and cat["tdd"]["path"] == ""
    with pytest.raises(RuntimeError, match="Connect"):
        m.list_skills("yale")


def test_add_from_the_catalog(home):
    m.add("wulver", "code-review", ["claude", "codex"])
    assert (home / ".claude/skills/code-review/SKILL.md").exists()
    assert (home / ".codex/skills/code-review/SKILL.md").exists()
    with pytest.raises(ValueError, match="no skill"):
        m.add("wulver", "../etc", ["claude"])
    with pytest.raises(ValueError, match="No agent"):
        m.add("wulver", "tdd", ["vim"])
    with pytest.raises(ValueError, match="at least one"):
        m.add("wulver", "tdd", [])


def test_install_only_what_browse_found(home, monkeypatch):
    repo = home / ".hpc-hub/skill-repos/example.org-jdoe-skills"
    skill(repo / "grill", "grill")
    found = [skills.Skill(str(repo / "grill"), "grill", "Asks questions.")]
    monkeypatch.setattr(skills, "browse", lambda ssh, url: found)
    got = m.browse("wulver", "https://example.org/jdoe/skills.git")
    assert got[0]["name"] == "grill" and got[0]["folder"] == "grill"
    with pytest.raises(ValueError, match="Load the repository"):
        m.install("wulver", [str(home / ".ssh")], ["claude"])
    m.install("wulver", [got[0]["path"]], ["agy"])
    assert (home / ".gemini/config/skills/grill/SKILL.md").exists()


def test_remove_only_your_own(home):
    skill(home / ".claude/skills/tdd", "tdd")
    skill(home / ".claude/skills/synced/notes", "notes")
    m.remove("wulver", str(home / ".claude/skills/tdd"), "claude")
    assert not (home / ".claude/skills/tdd").exists()
    with pytest.raises(ValueError, match="managed"):
        m.remove("wulver", str(home / ".claude/skills/synced/notes"), "claude")
    with pytest.raises(ValueError, match="not there"):
        m.remove("wulver", str(home / ".claude/skills/tdd"), "claude")
