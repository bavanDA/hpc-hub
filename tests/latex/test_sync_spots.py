import pytest

from hpc_hub.latex.git import GitError
from hpc_hub.latex.sync.spots import blocks, resolve

TEXT = "\n".join(["a", "b", "<<<<<<< theirs", "T", "||||||| base", "B", "=======", "M", ">>>>>>> mine", "c",
                  "<<<<<<< x", "T2", "======= y", "M2", ">>>>>>> z"])


def test_blocks_read_both_sides_and_the_base():
    first, second = blocks(TEXT)
    assert first == {"theirs": ["T"], "base": ["B"], "mine": ["M"], "line": 3, "end": 9, "before": ["a", "b"],
                     "after": ["c", "<<<<<<< x"]}
    assert (second["theirs"], second["base"], second["mine"]) == (["T2"], [], ["M2"])


@pytest.mark.parametrize("take, lines", [("mine", ["M"]), ("theirs", ["T"]), ("both", ["M", "T"])])
def test_resolve_takes_a_side(take, lines):
    out = resolve(TEXT, [{"take": take}, {"take": "edit", "text": "E1\nE2"}])
    assert out.split("\n") == ["a", "b", *lines, "c", "E1", "E2"]


def test_resolve_wants_every_spot():
    with pytest.raises(GitError, match="every spot"):
        resolve(TEXT, [{"take": "mine"}])
