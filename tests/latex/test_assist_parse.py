import pytest

from hpc_hub.latex.assist.message import parse_message
from hpc_hub.latex.assist.notes_check import check_prompt
from hpc_hub.latex.assist.reply import answer, json_object


def test_json_object_finds_it_in_fences_and_skips_the_rest():
    assert json_object('Sure:\n```json\n{"a": 1}\n```') == {"a": 1}
    assert json_object("no json here") is None
    assert json_object("{not json}") is None
    assert json_object("[1, 2]") is None


def test_answer_after_the_mark():
    assert answer("motd\n@@hpchub-answer@@\nhello") == "hello"
    assert answer("hello") == "hello"


def test_plain_text_message_skips_fences_and_labels():
    m = parse_message("```\nSubject: Fix the bound in Lemma 2.\nBody: it was off by one\n```", ["a.tex"])
    assert m == {"subject": "Fix the bound in Lemma 2", "body": "it was off by one", "commits": []}
    with pytest.raises(ValueError):
        parse_message("```\n\n```", [])


def test_split_matches_files_by_name_and_gives_the_rest_to_the_last():
    text = ('{"subject": "Edit", "body": "", "commits": [{"files": ["intro.tex"], "subject": "Intro"},'
            '{"files": ["sec/b.tex", "intro.tex"], "subject": "B"}]}')
    m = parse_message(text, ["sec/intro.tex", "sec/b.tex", "refs.bib"])
    assert [(c["subject"], c["files"]) for c in m["commits"]] == [("Intro", ["sec/intro.tex"]),
                                                                  ("B", ["sec/b.tex", "refs.bib"])]


def test_check_prompt_says_where_each_note_is():
    notes = [{"id": "abc123", "text": "fix", "place": {"path": "a.tex", "line": 3}},
             {"id": "xyz789", "text": "fig", "place": {"page": 2}},
             {"id": "n3", "text": "x", "place": {"hash": "f" * 40}}]
    p = check_prompt(notes, "diff")
    assert "(about a.tex line 3)" in p and "(about page 2 of the PDF)" in p and "(about commit fffffff)" in p
