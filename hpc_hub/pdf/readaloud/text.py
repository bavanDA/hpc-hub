import re
import unicodedata
from dataclasses import dataclass

SPEAKABLE = re.compile(r"[0-9a-z]")
EDGES = re.compile(r"^[^0-9a-z]+|[^0-9a-z]+$")
REPLACE = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
           "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"}
SENTENCE_ENDS = (".", "!", "?", "…")
CLOSERS = "\"')]”’"


@dataclass(frozen=True)
class Word:
    id: int
    page: int  # 1-based
    text: str
    box: tuple[float, float, float, float]  # x0, y0, x1, y1 in PDF points from the page's top left


@dataclass(frozen=True)
class Chunk:
    words: tuple[Word, ...]
    text: str


def display(text: str) -> str:
    for a, b in REPLACE.items():
        text = text.replace(a, b)
    return unicodedata.normalize("NFKC", text)


def match_key(text: str) -> str:
    return re.sub(r"\s+", "", EDGES.sub("", display(text).casefold()).replace("'", "").replace("-", ""))


def speakable(text: str) -> bool:
    return bool(SPEAKABLE.search(display(text).casefold()))


def _ends_sentence(text: str) -> bool:
    t = text.rstrip(CLOSERS)
    return len(t) > 1 and t.endswith(SENTENCE_ENDS)


def chunks(words: list[Word], budget: int = 600) -> list[Chunk]:
    """Sentence-sized pieces of about budget characters, so speech can be made in parallel."""
    out, current, length = [], [], 0
    for w in words:
        current.append(w)
        if not speakable(w.text):
            continue
        length += len(w.text) + 1
        if (_ends_sentence(w.text) and length >= budget * 0.6) or length >= budget:
            out.append(current)
            current, length = [], 0
    if current:
        out.append(current)
    result = []
    for group in out:
        spoken = " ".join(display(w.text) for w in group if speakable(w.text))
        if spoken:
            result.append(Chunk(tuple(group), spoken))
    return result
