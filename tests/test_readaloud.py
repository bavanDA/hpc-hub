from hpc_hub.readaloud import align, text
from hpc_hub.readaloud.text import Word


def words(*names):
    return [Word(i, 1, n, (0, 0, 1, 1)) for i, n in enumerate(names)]


def test_match_and_chunks():
    assert text.match_key("“Hello,”") == "hello" and text.match_key("three-") == "three"
    assert text.display("ﬁnd") == "find" and not text.speakable("—")
    ws = words("One", "two.", "Three", "four.", "(1)")
    cs = text.chunks(ws, budget=10)
    assert [c.text for c in cs] == ["One two.", "Three four.", "(1)"]
    assert [len(c.words) for c in text.chunks(words("a", "—", "b."), budget=100)] == [3]  # dash rides along


def test_align_handles_splits_merges_and_drift():
    ws = words("We", "saw", "3.5", "percent", "growth", "—", "in", "data-sets", "today")
    tokens = [("We", 0.0, 0.2), ("saw", 0.2, 0.4), ("3.5percent", 0.4, 1.0), ("growth", 1.0, 1.3),
              ("in", 1.4, 1.5), ("data", 1.5, 1.7), ("sets", 1.7, 1.9), ("um", 1.9, 2.0), ("today", 2.0, 2.4)]
    t = align.align(tuple(ws), tokens)
    assert t[0] == (0.0, 0.2) and t[2][0] == 0.4 and t[3][1] == 1.0 and t[2][1] < t[3][1]
    assert t[7] == (1.5, 1.9) and t[8] == (2.0, 2.4)
    filled = align.fill_gaps(ws, t, 2.4)
    assert [w for w, _, _ in filled] == list(range(9))  # every word, dash included
    assert all(a[1] <= b[1] for a, b in zip(filled, filled[1:]))


def test_dictionary_parsing():
    from hpc_hub.readaloud import dictionary as d
    assert d.term("“Census,”") == "census" and "study" in d.base_forms("studies")
    assert d.base_forms("running")[:3] == ["runn", "runne", "run"]
    free = [{"word": "algorithm", "phonetic": "/ˈælɡəɹɪðm̩/", "phonetics": [{"audio": "https://x/a.mp3"}],
             "meanings": [{"partOfSpeech": "noun", "definitions": [{"definition": "Steps.", "example": "An example.",
                                                                   "synonyms": ["procedure"]}]}]}]
    e = d.parse_free("algorithm", free)
    assert (e.respelling, e.audio, e.meanings[0][0]) == ("AL-guh-ri-thuhm", "https://x/a.mp3", "noun")
    assert e.meanings[0][1][0].synonyms == ["procedure"]
    wik = {"en": [{"partOfSpeech": "Noun", "definitions": [{"definition": "A <a href='x'>polygon</a> &amp; more",
                                                            "examples": ["<i>A</i> triangle."]}]}]}
    w = d.parse_wiktionary("triangle", wik)
    assert w.meanings[0][1][0].definition == "A polygon & more" and w.meanings[0][1][0].example == "A triangle."
    import pytest
    with pytest.raises(d.NotFound):
        d.parse_wiktionary("triangles", {"en": [{"definitions": [{"definition": "plural of triangle"}]}]})
    with pytest.raises(d.NotFound):
        d.term("3.5")
