"""Run by the read-aloud environment's Python: every word of a PDF in reading order (PyMuPDF), as JSON.

PyMuPDF groups text into blocks and lines, so two-column papers read column by column (as in ReadLoud).
argv[1]: the PDF. stdout: [[page, text, x0, y0, x1, y1], ...] in PDF points from each page's top left.
"""

import json
import sys

import pymupdf

out = []
for page in pymupdf.open(sys.argv[1]):
    for w in sorted(page.get_text("words"), key=lambda w: (w[5], w[6], w[7])):  # block, line, word
        if w[4].strip():
            out.append([page.number + 1, w[4].strip(), *(round(v, 2) for v in w[:4])])
json.dump(out, sys.stdout)
