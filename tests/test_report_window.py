"""The report window, as two people asked for it (bug board: report-minimize, report-screenshot): Minimize sits right
beside Close in the title bar, as on any window, and a picture pasted anywhere in the report becomes its screenshot.
Read from the source: the app's unit tests run without a page to render in."""

import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "app" / "src" / "components"


def test_minimize_sits_right_beside_close():
    header = re.search(r"<header.*?</header>", (SRC / "e" / "EDialog.tsx").read_text(), re.S).group(0)
    minimize, close = header.find('aria-label="Minimize this window"'), header.find('aria-label="Close"')
    assert 0 <= minimize < close  # in the title bar, just before Close
    between = header[minimize:close]
    assert between.count("<button") == 1  # nothing else in between: Minimize itself only


def test_the_report_minimizes_and_takes_a_pasted_picture():
    dialog = (SRC / "report" / "ReportDialog.tsx").read_text()
    assert "onMinimize={() => setSmall(true)}" in dialog
    assert re.search(r"<div onPaste=\{onPaste\} onKeyDown=\{onKey\}>", dialog)  # the whole report, not one field
    paste = dialog[dialog.index("function onPaste"):dialog.index("function onKey")]
    assert "imageIn(" in paste and "takePicture(blob)" in paste
    assert "readImage()" in dialog[dialog.index("function onKey"):]  # webviews that give a paste no picture
