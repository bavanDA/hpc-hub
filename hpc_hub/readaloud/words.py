"""Every word of a PDF with its box, from the PDF's own text layer (Poppler), in reading order."""

import gi

gi.require_version("Poppler", "0.18")
from gi.repository import GLib, Poppler  # noqa: E402

from .text import Word  # noqa: E402


def extract(data: bytes) -> list[Word]:
    doc = Poppler.Document.new_from_bytes(GLib.Bytes.new(data), None)
    words: list[Word] = []
    for n in range(doc.get_n_pages()):
        page = doc.get_page(n)
        chars = page.get_text() or ""
        ok, rects = page.get_text_layout()
        if not ok or len(rects) != len(chars):
            continue
        cur, box = "", None
        for ch, r in zip(chars + " ", list(rects) + [None]):
            if ch.isspace() or r is None:
                if cur:
                    words.append(Word(len(words), n + 1, cur, box))
                cur, box = "", None
                continue
            cur += ch
            b = (r.x1, r.y1, r.x2, r.y2)
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return words
