import pytest

from hpc_hub.latex.git import GitError
from hpc_hub.latex.history.blame import relpath
from hpc_hub.latex.history.commits import new_path, numstat
from hpc_hub.latex.history.diff_parse import parse_diff
from hpc_hub.latex.history.diff_words import blocks, word_marks

RENAME = """diff --git a/old.tex b/new.tex
similarity index 90%
rename from old.tex
rename to new.tex
diff --git a/gone.tex b/gone.tex
deleted file mode 100644
--- a/gone.tex
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/fig.png b/fig.png
Binary files a/fig.png and b/fig.png differ
"""


def test_parse_diff_renames_deletes_and_binaries():
    renamed, deleted, binary = parse_diff(RENAME)
    assert (renamed["old_path"], renamed["path"], renamed["status"]) == ("old.tex", "new.tex", "R")
    assert deleted["status"] == "D" and deleted["removed"] == 1
    assert deleted["hunks"][0]["rows"] == [{"k": "-", "o": 1, "n": None, "t": "bye", "m": []}]
    assert binary["binary"]


def test_parse_diff_unquotes_utf8_paths():
    text = 'diff --git "a/caf\\303\\251.tex" "b/caf\\303\\251.tex"\nrename from "caf\\303\\251.tex"\n'
    assert parse_diff(text)[0]["old_path"] == "café.tex"


def test_numstat_follows_renames_and_binaries():
    rows = numstat("3\t1\tsrc/{a.tex => b.tex}\n-\t-\tfig.png\nnot a row\n")
    assert rows == [{"path": "src/b.tex", "added": 3, "removed": 1, "binary": False},
                    {"path": "fig.png", "added": 0, "removed": 0, "binary": True}]
    assert new_path("a => b") == "b" and new_path("x/{ => y}/z") == "x/y/z"


def test_word_marks_join_marks_split_by_spaces():
    old, new = word_marks("the big red dog", "the small blue dog")
    assert old == [[4, 11]] and new == [[4, 14]]


def test_blocks_are_runs_of_changes():
    rows = [{"k": " "}, {"k": "-"}, {"k": "+"}, {"k": " "}, {"k": "+"}]
    assert blocks(rows) == [(1, 3), (4, 5)]


def test_relpath():
    assert relpath("/home/jdoe/paper", "/home/jdoe/paper/sec/a.tex") == "sec/a.tex"
    assert relpath("/home/jdoe/paper/", "a.tex") == "a.tex"
    for bad in ("/etc/passwd", "../x.tex"):
        with pytest.raises(GitError):
            relpath("/home/jdoe/paper", bad)
