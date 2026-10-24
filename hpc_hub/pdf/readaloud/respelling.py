"""Google-style phonetic respelling of a word: plain letters, hyphenated syllables, stress in caps.

The IPA path is authoritative; the orthographic fallback only covers unambiguous spellings.
"""

import re
import unicodedata
from typing import NamedTuple


class _Vowel(NamedTuple):
    text: str
    lax: bool = False
    before_r: str = ""
    alone: str = ""


class _Segment(NamedTuple):
    text: str
    vowel: _Vowel | None = None


class _Chunk(NamedTuple):
    segments: list[_Segment]
    stress: int


class _Syllable(NamedTuple):
    onset: list[_Segment]
    nucleus: _Vowel
    coda: list[_Segment]
    primary: bool


_NO_STRESS = 0
_PRIMARY = 1
_SECONDARY = 2

_BOUNDARIES = {"ˈ": _PRIMARY, "ˌ": _SECONDARY, ".": _NO_STRESS, "-": _NO_STRESS, "|": _NO_STRESS}

# Diacritics that carry no information for a respelling; syllabic marks are kept because
# they form their own nuclei (see the "n̩" style entries below).
_IGNORED_MARKS = ("\u0361", "\u035c", "\u032f", "\u02d1", "\u203f", "\u200d", "\ufeff", "\u0303")

_IPA_VOWELS: dict[str, _Vowel] = {
    "aɪ": _Vowel("y", alone="eye"),
    "aʊ": _Vowel("ow"),
    "eɪ": _Vowel("ay"),
    "ɔɪ": _Vowel("oy"),
    "oɪ": _Vowel("oy"),
    "oʊ": _Vowel("oh"),
    "əʊ": _Vowel("oh"),
    "juː": _Vowel("yoo"),
    "ju": _Vowel("yoo"),
    "ɪə": _Vowel("eer"),
    "eə": _Vowel("air"),
    "ʊə": _Vowel("oor"),
    "iː": _Vowel("ee", before_r="eer"),
    "i": _Vowel("ee", before_r="eer"),
    "ɪ": _Vowel("i", lax=True, before_r="eer"),
    "ɨ": _Vowel("i", lax=True),
    "uː": _Vowel("oo", before_r="oor"),
    "u": _Vowel("oo", before_r="oor"),
    "ʊ": _Vowel("uu", lax=True, before_r="oor"),
    "eː": _Vowel("ay"),
    "ɛ": _Vowel("e", lax=True, before_r="air"),
    "e": _Vowel("e", lax=True, before_r="air"),
    "æ": _Vowel("a", lax=True, before_r="ar"),
    "ɑː": _Vowel("ah", before_r="ar"),
    "ɑ": _Vowel("ah", before_r="ar"),
    "a": _Vowel("ah", lax=True, before_r="ar"),
    "ɒ": _Vowel("o", lax=True, before_r="or"),
    "ɔː": _Vowel("aw", before_r="or"),
    "ɔ": _Vowel("aw", before_r="or"),
    "oː": _Vowel("oh", before_r="or"),
    "o": _Vowel("oh", before_r="or"),
    "ʌ": _Vowel("uh", lax=True, before_r="ur"),
    "ə": _Vowel("uh", lax=True, before_r="ur"),
    "ɐ": _Vowel("uh", lax=True, before_r="ur"),
    "ɜː": _Vowel("ur"),
    "ɜ": _Vowel("ur"),
    "ɝ": _Vowel("ur"),
    "ɚ": _Vowel("ur"),
    "ə˞": _Vowel("ur"),
    "ɜ˞": _Vowel("ur"),
    "n̩": _Vowel("uhn"),
    "m̩": _Vowel("uhm"),
    "l̩": _Vowel("uhl"),
    "ɹ̩": _Vowel("ur"),
}

_IPA_CONSONANTS: dict[str, str] = {
    "tʃ": "ch",
    "dʒ": "j",
    "ʃ": "sh",
    "ʒ": "zh",
    "θ": "th",
    "ð": "th",
    "ŋ": "ng",
    "p": "p",
    "b": "b",
    "t": "t",
    "d": "d",
    "k": "k",
    "ɡ": "g",
    "g": "g",
    "f": "f",
    "v": "v",
    "s": "s",
    "z": "z",
    "m": "m",
    "n": "n",
    "l": "l",
    "ɫ": "l",
    "r": "r",
    "ɹ": "r",
    "ɾ": "t",
    "w": "w",
    "ʍ": "w",
    "h": "h",
    "j": "y",
    "x": "kh",
    "ç": "h",
}

_SPELLING_VOWELS: dict[str, _Vowel] = {
    "ee": _Vowel("ee", before_r="eer"),
    "oo": _Vowel("oo", before_r="oor"),
    "ai": _Vowel("ay"),
    "ay": _Vowel("ay"),
    "oa": _Vowel("oh"),
    "oi": _Vowel("oy"),
    "oy": _Vowel("oy"),
    "a": _Vowel("a", lax=True, before_r="ar"),
    "e": _Vowel("e", lax=True, before_r="ur"),
    "i": _Vowel("i", lax=True, before_r="ur"),
    "o": _Vowel("o", lax=True, before_r="or"),
    "u": _Vowel("uh", lax=True, before_r="ur"),
    "y": _Vowel("i", lax=True, before_r="ur"),
}

_SPELLING_CONSONANTS: dict[str, str] = {
    "tch": "ch",
    "ch": "ch",
    "sh": "sh",
    "th": "th",
    "ph": "f",
    "ck": "k",
    "ng": "ng",
    "kn": "n",
    "wr": "r",
    "wh": "w",
    "qu": "kw",
    "b": "b",
    "c": "k",
    "d": "d",
    "f": "f",
    "g": "g",
    "h": "h",
    "j": "j",
    "k": "k",
    "l": "l",
    "m": "m",
    "n": "n",
    "p": "p",
    "q": "kw",
    "r": "r",
    "s": "s",
    "t": "t",
    "v": "v",
    "w": "w",
    "x": "ks",
    "z": "z",
}

# Spellings whose pronunciation cannot be guessed from the letters alone.
_AMBIGUOUS_SPELLINGS = (
    "ough",
    "augh",
    "eigh",
    "tion",
    "sion",
    "ea",
    "ei",
    "ie",
    "ou",
    "ow",
    "au",
    "eu",
    "ew",
    "ue",
    "ui",
    "oe",
    "gh",
    "ce",
    "ci",
    "cy",
    "ge",
    "gi",
    "gy",
)
_DOUBLED_CONSONANT = re.compile(r"([bcdfglmnprstz])\1")
_SPELLABLE = re.compile(r"[a-z]{3,14}")

_OPTIONAL_SOUNDS = re.compile(r"\([^)]*\)")
_VARIANT_SEPARATOR = re.compile(r"[,;~]")
_DELIMITERS = re.compile(r"^[\s/\[\]]+|[\s/\[\]]+$")
_RESPELLING = re.compile(r"[A-Za-z]+(?:-[A-Za-z]+)*")

# Clusters English allows word-initially, so they move to the next syllable as a unit.
_ONSET_CLUSTERS = frozenset(
    {
        ("b", "l"),
        ("b", "r"),
        ("d", "r"),
        ("d", "w"),
        ("f", "l"),
        ("f", "r"),
        ("g", "l"),
        ("g", "r"),
        ("g", "w"),
        ("k", "l"),
        ("k", "r"),
        ("k", "w"),
        ("p", "l"),
        ("p", "r"),
        ("s", "k"),
        ("s", "l"),
        ("s", "m"),
        ("s", "n"),
        ("s", "p"),
        ("s", "t"),
        ("s", "w"),
        ("sh", "r"),
        ("t", "r"),
        ("t", "w"),
        ("th", "r"),
        ("th", "w"),
        ("v", "r"),
    }
)


def _segment_table(
    vowels: dict[str, _Vowel], consonants: dict[str, str]
) -> tuple[dict[str, _Segment], int]:
    table = {symbol: _Segment(vowel.text, vowel) for symbol, vowel in vowels.items()}
    table.update({symbol: _Segment(text) for symbol, text in consonants.items()})
    return table, max(len(symbol) for symbol in table)


_IPA_SEGMENTS, _IPA_LONGEST = _segment_table(_IPA_VOWELS, _IPA_CONSONANTS)
_SPELLING_SEGMENTS, _SPELLING_LONGEST = _segment_table(_SPELLING_VOWELS, _SPELLING_CONSONANTS)


def respell_from_ipa(ipa: str) -> str | None:
    """Convert an IPA transcription into a Google-style respelling."""
    body = _clean_ipa(ipa)
    if not body:
        return None
    chunks = _chunks(body)
    if chunks is None:
        return None
    return _assemble([syllable for chunk in chunks for syllable in _syllabify(chunk)])


def respell_from_spelling(word: str) -> str | None:
    """Fallback respelling derived from English orthography when no IPA exists."""
    letters = _clean_spelling(word)
    if letters is None:
        return None
    segments = _tokenize(letters, _SPELLING_SEGMENTS, _SPELLING_LONGEST)
    if segments is None:
        return None
    return _assemble(_syllabify(_Chunk(segments, _PRIMARY)))


def respell(word: str, ipa: str | None) -> str | None:
    """Preferred entry point: use IPA when available, else fall back to spelling."""
    if ipa:
        respelled = respell_from_ipa(ipa)
        if respelled:
            return respelled
    return respell_from_spelling(word)


def _clean_ipa(ipa: str) -> str:
    text = unicodedata.normalize("NFC", ipa).lower()
    text = _OPTIONAL_SOUNDS.sub("", text)
    text = _VARIANT_SEPARATOR.split(text)[0]
    for mark in _IGNORED_MARKS:
        text = text.replace(mark, "")
    text = text.replace(":", "ː").replace("'", "ˈ").replace("ʼ", "ˈ").replace("‖", "|")
    text = _DELIMITERS.sub("", text)
    return "".join(text.split())


def _clean_spelling(word: str) -> str | None:
    letters = unicodedata.normalize("NFC", word).strip().lower()
    if not _SPELLABLE.fullmatch(letters) or letters.startswith("y"):
        return None
    # A final "e" is usually silent and lengthens the preceding vowel, which the letter
    # tables cannot express, so those words are left to the IPA path.
    if letters.endswith("e"):
        return None
    if any(pattern in letters for pattern in _AMBIGUOUS_SPELLINGS):
        return None
    if letters.endswith("y"):
        letters = f"{letters[:-1]}ee"
    return _DOUBLED_CONSONANT.sub(r"\1", letters)


def _tokenize(body: str, table: dict[str, _Segment], longest: int) -> list[_Segment] | None:
    segments: list[_Segment] = []
    index = 0
    while index < len(body):
        # Longest match first, otherwise "tʃ" would be read as "t" plus "ʃ".
        for size in range(min(longest, len(body) - index), 0, -1):
            segment = table.get(body[index : index + size])
            if segment is not None:
                segments.append(segment)
                index += size
                break
        else:
            return None
    return segments


def _chunks(body: str) -> list[_Chunk] | None:
    chunks: list[_Chunk] = []
    current = ""
    stress = _NO_STRESS
    for character in body:
        if character not in _BOUNDARIES:
            current += character
            continue
        if current:
            segments = _tokenize(current, _IPA_SEGMENTS, _IPA_LONGEST)
            if segments is None:
                return None
            chunks.append(_Chunk(segments, stress))
        current = ""
        stress = _BOUNDARIES[character]
    if current:
        segments = _tokenize(current, _IPA_SEGMENTS, _IPA_LONGEST)
        if segments is None:
            return None
        chunks.append(_Chunk(segments, stress))
    return _merge_vowelless(chunks)


def _merge_vowelless(chunks: list[_Chunk]) -> list[_Chunk]:
    """Attach consonant-only chunks to a neighbour so no sound is dropped."""
    merged: list[_Chunk] = []
    for chunk in chunks:
        if merged and not any(segment.vowel for segment in chunk.segments):
            previous = merged[-1]
            merged[-1] = _Chunk(previous.segments + chunk.segments, previous.stress)
            continue
        merged.append(chunk)
    if len(merged) > 1 and not any(segment.vowel for segment in merged[0].segments):
        head, following = merged[0], merged[1]
        merged[:2] = [_Chunk(head.segments + following.segments, following.stress)]
    return merged


def _syllabify(chunk: _Chunk) -> list[_Syllable]:
    nuclei = [index for index, segment in enumerate(chunk.segments) if segment.vowel]
    if not nuclei:
        return []
    bounds = [0]
    bounds.extend(
        _split_point(chunk, nuclei[order], nuclei[order + 1], order)
        for order in range(len(nuclei) - 1)
    )
    bounds.append(len(chunk.segments))
    syllables: list[_Syllable] = []
    for order, position in enumerate(nuclei):
        nucleus = chunk.segments[position].vowel
        if nucleus is None:
            continue
        syllables.append(
            _Syllable(
                onset=chunk.segments[bounds[order] : position],
                nucleus=nucleus,
                coda=chunk.segments[position + 1 : bounds[order + 1]],
                primary=order == 0 and chunk.stress == _PRIMARY,
            )
        )
    return syllables


def _split_point(chunk: _Chunk, left: int, right: int, order: int) -> int:
    gap = chunk.segments[left + 1 : right]
    if not gap:
        return right
    nucleus = chunk.segments[left].vowel
    stressed_lax = order == 0 and chunk.stress != _NO_STRESS and bool(nucleus and nucleus.lax)
    if len(gap) == 1:
        # A lone consonant closes a stressed lax syllable ("EL-uh-fuhnt") but otherwise
        # opens the next one ("WAW-tur").
        return right if stressed_lax else left + 1
    if stressed_lax or (gap[-2].text, gap[-1].text) not in _ONSET_CLUSTERS:
        return right - 1
    return right - 2


def _assemble(syllables: list[_Syllable]) -> str | None:
    if not syllables:
        return None
    total = len(syllables)
    parts = [_render(syllable, order, total) for order, syllable in enumerate(syllables)]
    if total == 1:
        result = parts[0].upper()
    else:
        stressed = next((order for order, syllable in enumerate(syllables) if syllable.primary), 0)
        parts[stressed] = parts[stressed].upper()
        result = "-".join(parts)
    return result if _RESPELLING.fullmatch(result) else None


def _render(syllable: _Syllable, order: int, total: int) -> str:
    nucleus = syllable.nucleus
    text = nucleus.text
    coda = syllable.coda
    if coda and coda[0].text == "r" and nucleus.before_r:
        text = nucleus.before_r
        coda = coda[1:]
    elif not syllable.onset and not coda:
        if 0 < order < total - 1 and not syllable.primary and nucleus.lax:
            # A bare unstressed vowel between syllables reduces to a schwa.
            text = "uh"
        elif nucleus.alone:
            text = nucleus.alone
    onset = "".join(segment.text for segment in syllable.onset)
    tail = "".join(segment.text for segment in coda)
    return f"{onset}{text}{tail}"
