import pytest

from hpc_hub.projects import store
from hpc_hub.projects.store import Project


def test_round_trip(tmp_path):
    path = tmp_path / "p.toml"
    assert store.load(path) == []
    items = [Project("myproj", "wulver", "/scratch/mygroup/jdoe/myproj", opened=5),
             Project('my "mc"', "yale", "/nfs/x/thesis", main_tex="paper/main.tex")]
    store.save(items, path)
    assert store.load(path) == items


def test_save_stamps_changes_and_removals(tmp_path):
    path = tmp_path / "p.toml"
    a, b = Project("a", "wulver", "/a"), Project("b", "wulver", "/b")
    store.save([a, b], path)
    assert a.updated > 0 and b.updated > 0
    a.updated = b.updated = 1
    store.save([a, b], path)
    assert (a.updated, b.updated) == (1, 1)  # nothing changed: no new stamp
    a.name = "a2"
    store.save([a], path)
    assert a.updated > 1 and store.load_removed(tmp_path / store.REMOVED).keys() == {"wulver:/b"}


def test_a_broken_removed_file_reads_as_empty(tmp_path):
    (tmp_path / "r.json").write_text("[1, 2]")
    assert store.load_removed(tmp_path / "r.json") == {}
    store.save_removed({"wulver:/a": 5, "x": "bad"}, tmp_path / "r.json")
    assert store.load_removed(tmp_path / "r.json") == {"wulver:/a": 5}


def test_is_latex():
    assert Project("p", "w", "/x", "main.tex").is_latex
    assert not Project("mc", "w", "/x", "papers/final/main.tex").is_latex  # a repo with a paper inside
    assert not Project("k", "w", "/x").is_latex
    assert Project("p", "w", "/x", kind="latex").is_latex
    assert not Project("c", "w", "/x", "main.tex", kind="code").is_latex


@pytest.mark.parametrize("path,user,group", [
    ("/scratch/mygroup/jdoe/proj", "jdoe", "mygroup"),
    ("/mmfs1/project/mygroup/jdoe/a", "jdoe", "mygroup"),
    ("/expanse/lustre/projects/abc123/jdoe/x", "jdoe", "abc123"),
    ("/home/jdoe/project_pi_abc/x", "jdoe", "pi_abc"),
    ("/scratch/jdoe/proj", "jdoe", ""),
    ("~/code/x", "jdoe", ""),
])
def test_group_of(path, user, group):
    assert store.group_of(path, user) == group
