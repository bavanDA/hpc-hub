import subprocess

import pytest

from hpc_hub.agents import skills


def test_scan_and_parse(tmp_path):
    a = tmp_path / ".claude/skills/tdd"
    a.mkdir(parents=True)
    (a / "SKILL.md").write_text('---\nname: tdd\ndescription: "Test first."\n---\nbody\n')
    b = tmp_path / ".claude/skills/synced/x/docs"
    b.mkdir(parents=True)
    (b / "SKILL.md").write_text("---\nname: docs\ndescription: Docs.\n---\n")
    (tmp_path / ".claude/skills/notes").mkdir()
    (tmp_path / ".claude/skills/notes/SKILL.md").write_text("no front matter\n")
    out = subprocess.run(["bash", "-c", skills.SCAN, "_", str(tmp_path / ".claude/skills")],
                         capture_output=True, text=True).stdout
    got = {s.name: s for s in skills.parse(out, "claude")}
    assert set(got) == {"tdd", "docs"}
    assert got["tdd"].description == "Test first." and not got["tdd"].managed and got["tdd"].folder == "tdd"
    assert got["docs"].managed


def test_commands():
    sk = skills.Skill("/r/skills/engineering/tdd", "tdd", target="claude")
    cmd = skills.install_command([sk], ["claude", "codex"])
    assert 'cp -r /r/skills/engineering/tdd "$HOME"/.claude/skills/tdd' in cmd and ".codex/skills/tdd" in cmd
    assert skills.remove_command(sk) == 'rm -rf "$HOME"/.claude/skills/tdd'
    with pytest.raises(ValueError):
        skills.remove_command(skills.Skill("/h/.claude/skills/synced/x", "x", target="claude", managed=True))
    assert skills.repo_folder("https://github.com/mattpocock/skills.git").endswith("github.com-mattpocock-skills")


def test_catalog_ships_with_the_app():
    got = {sk.name: sk for sk in skills.catalog()}
    assert {"tdd", "diagnosing-bugs", "code-review"} <= set(got)
    assert all(sk.description for sk in got.values())
    assert skills.front_matter('---\nname: x\ndescription: "Do y."\n---\nbody') == {"name": "x", "description": "Do y."}
    assert skills.front_matter("no header") == {}
