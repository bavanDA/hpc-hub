import pytest

from hpc_hub.latex import notes


def test_a_place_is_a_line_a_pdf_spot_or_a_commit():
    assert notes.clean_place({"path": " main.tex ", "line": "0"}) == {"path": "main.tex", "line": 1}
    assert notes.clean_place({"page": "3", "x": "1.5"}) == {"page": 3, "x": 1.5, "y": 0.0}
    assert notes.clean_place({"hash": " abc123 "}) == {"hash": "abc123"}
    assert notes.clean_place({"path": "  "}) is None
    assert notes.clean_place("main.tex") is None


@pytest.mark.parametrize("place", [{"path": "/etc/passwd"}, {"path": "../x.tex"}, {"hash": "HEAD; rm -rf ~"}])
def test_a_bad_place_is_refused(place):
    with pytest.raises(ValueError):
        notes.clean_place(place)
