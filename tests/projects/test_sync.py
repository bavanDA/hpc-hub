from hpc_hub.projects import sync
from hpc_hub.projects.store import Project


def test_the_newer_change_wins_and_opened_keeps_the_latest():
    mine = [Project("a", "wulver", "/p/a", opened=50, updated=10), Project("b", "wulver", "/p/b", updated=30)]
    shared = {"projects": [{"name": "A", "path": "/p/a", "opened": 20, "updated": 20},
                           {"name": "B", "path": "/p/b", "updated": 5}, {"name": "c", "path": "/p/c", "updated": 1}]}
    got, _ = sync.merge("wulver", mine, {}, shared)
    by = {p.path: p for p in got}
    assert by["/p/a"].name == "A" and by["/p/a"].opened == 50
    assert by["/p/b"].name == "b" and by["/p/c"].cluster == "wulver"


def test_removed_stays_removed_until_added_again():
    mine = [Project("a", "wulver", "/p/a", updated=10)]
    got, gone = sync.merge("wulver", mine, {}, {"removed": {"/p/a": 2_000_000_000}})
    assert got == [] and "/p/a" in gone
    again = [Project("a", "wulver", "/p/a", updated=2_000_000_001)]
    assert sync.merge("wulver", again, gone, {})[0] == again


def test_rows_that_make_no_sense_are_skipped():
    got, _ = sync.merge("wulver", [], {}, {"projects": [{"name": "x"}, "junk", {"name": "", "path": "/a"},
                                                         {"name": "ok", "path": "/ok", "opened": "soon"}]})
    assert [(p.name, p.opened) for p in got] == [("ok", 0)]
