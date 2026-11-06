import json
import sys

import pytest

from hpc_hub.pdf.readaloud import words


def fake_python(tmp_path, body: str):
    """A 'Python' that runs body instead of the PyMuPDF worker."""
    script = tmp_path / "fake.py"
    script.write_text(body)
    launcher = tmp_path / "python"
    launcher.write_text(f"#!/bin/sh\nexec {sys.executable} {script}\n")
    launcher.chmod(0o755)
    return launcher


@pytest.mark.skipif(sys.platform == "win32", reason="a shell launcher stands in for the venv's Python")
def test_words_come_back_numbered_in_reading_order(tmp_path):
    out = [[1, "Hello", 0, 0, 10, 5], [2, "world.", 1, 2, 3, 4]]
    py = fake_python(tmp_path, f"import sys; sys.stdout.write({json.dumps(json.dumps(out))})")
    got = words.extract(b"%PDF", py)
    assert [(w.id, w.page, w.text, w.box) for w in got] == [(0, 1, "Hello", (0, 0, 10, 5)),
                                                             (1, 2, "world.", (1, 2, 3, 4))]


@pytest.mark.skipif(sys.platform == "win32", reason="a shell launcher stands in for the venv's Python")
@pytest.mark.parametrize("body", ["import sys; sys.exit(1)", "print('not json')"])
def test_a_pdf_it_cannot_read_says_so(tmp_path, body):
    with pytest.raises(ValueError, match="Could not read the words"):
        words.extract(b"%PDF", fake_python(tmp_path, body))
