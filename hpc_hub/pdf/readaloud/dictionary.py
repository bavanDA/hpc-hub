import html
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from .respelling import respell
from .text import display

FREE_DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/"
WIKTIONARY = "https://en.wiktionary.org/api/rest_v1/page/definition/"
AGENT = "HPC-Hub/1.0 (desktop app)"
DOUBLED = "bdfglmnprst"
FORM_OF = re.compile(r"^(plural|simple past|past participle|present participle|third-person singular|"
                     r"comparative|superlative|alternative (form|spelling)|misspelling)\b.* of \w", re.I)


class NotFound(Exception):
    pass


@dataclass
class Sense:
    definition: str
    example: str = ""
    synonyms: list[str] = field(default_factory=list)


@dataclass
class Entry:
    word: str
    phonetic: str = ""
    respelling: str = ""  # e.g. pruh-nuhn-see-AY-shuhn
    audio: str = ""  # a recording of the word, if there is one
    meanings: list[tuple[str, list[Sense]]] = field(default_factory=list)  # (part of speech, senses)
    source: str = ""


def term(raw: str) -> str:
    """'Census,' -> 'census'. Raises NotFound for things that are not words (numbers, symbols)."""
    t = re.sub(r"^[^\w]+|[^\w]+$", "", display(raw).strip()).strip("-'")
    if not re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", t or ""):
        raise NotFound(f"'{raw.strip()}' is not a word to look up")
    return t.lower()


def base_forms(word: str) -> list[str]:
    """Guesses at the dictionary form: studies -> study, computed -> compute, running -> run."""
    w, out = word.lower(), []

    def undouble(stem):
        return [stem[:-1]] if len(stem) >= 3 and stem[-1] == stem[-2] and stem[-1] in DOUBLED else []
    if w.endswith("ies"):
        out.append(w[:-3] + "y")
    if w.endswith(("ches", "shes", "sses", "xes", "zes")):
        out.append(w[:-2])
    if w.endswith("es"):
        out += [w[:-1], w[:-2]]
    if w.endswith("s") and not w.endswith(("ss", "us", "is")):
        out.append(w[:-1])
    if w.endswith("ied"):
        out.append(w[:-3] + "y")
    if w.endswith("ed"):
        out += [w[:-1], w[:-2], *undouble(w[:-2])]
    if w.endswith("ing"):
        out += [w[:-3], w[:-3] + "e", *undouble(w[:-3])]
    if w.endswith("ly"):
        out.append(w[:-2])
    if w.endswith(("er", "est")):
        stem = w[:-2] if w.endswith("er") else w[:-3]
        out += [stem, stem + "e", *undouble(stem)]
    seen, result = set(), []
    for c in out:
        if len(c) >= 2 and c != w and c not in seen:
            seen.add(c)
            result.append(c)
    return result


def _get(url: str, tries: int = 3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=8) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound(url) from e
            raise ConnectionError(f"The dictionary answered {e.code}") from e  # server trouble: don't wait
        except (urllib.error.URLError, TimeoutError, ValueError):
            pass
        time.sleep(0.3 * (attempt + 1))
    raise ConnectionError("The dictionary could not be reached")


def parse_free(word: str, payload: list) -> Entry:
    entries = [e for e in payload if isinstance(e, dict)]
    ipa = next((str(e["phonetic"]) for e in entries if e.get("phonetic")), "") or next(
        (str(p["text"]) for e in entries for p in e.get("phonetics") or []
         if isinstance(p, dict) and p.get("text")), "")
    audio = next((str(p["audio"]) for e in entries for p in e.get("phonetics") or []
                  if isinstance(p, dict) and p.get("audio")), "")
    meanings = []
    for e in entries:
        for m in e.get("meanings") or []:
            senses = [Sense(str(d["definition"]), str(d.get("example") or ""),
                            [str(x) for x in d.get("synonyms") or []])
                      for d in m.get("definitions") or [] if isinstance(d, dict) and d.get("definition")]
            if senses:
                meanings.append((str(m.get("partOfSpeech") or ""), senses))
    word = str(entries[0].get("word") or word) if entries else word
    return Entry(word, ipa, (respell(word, ipa) or "") if ipa else "", audio, meanings, "Free Dictionary API")


def _plain(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def parse_wiktionary(word: str, payload: dict) -> Entry:
    meanings = []
    for block in payload.get("en") or []:
        senses = [Sense(_plain(d.get("definition", "")), _plain((d.get("examples") or [""])[0]))
                  for d in block.get("definitions") or [] if _plain(d.get("definition", ""))]
        if senses:
            meanings.append((str(block.get("partOfSpeech") or "").lower(), senses[:6]))
    if not meanings or all(FORM_OF.match(s.definition) for _, senses in meanings for s in senses):
        raise NotFound(word)  # only "plural of triangle": the caller tries the base form next
    return Entry(word, "", "", "", meanings, "Wiktionary")


def _cache(word: str) -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "hpc-hub" / "dictionary" / f"{word}.json"


def _first(candidates: list[str], fetch) -> Entry | None:
    for c in candidates:
        try:
            return fetch(c)
        except (NotFound, ConnectionError):
            continue
    return None


def lookup(raw: str) -> Entry:
    word = term(raw)
    f = _cache(word)
    if f.exists():
        raw_entry = json.loads(f.read_text())
        raw_entry["meanings"] = [(pos, [Sense(**s) for s in senses]) for pos, senses in raw_entry["meanings"]]
        return Entry(**raw_entry)
    candidates = [word] + base_forms(word)[:3]  # the dictionary form has the pronunciation and examples
    entry = _first(candidates, lambda w: parse_free(w, _get(FREE_DICT + urllib.parse.quote(w)))) or _first(
        candidates, lambda w: parse_wiktionary(w, _get(WIKTIONARY + urllib.parse.quote(w), tries=2)))
    if entry is None:
        raise NotFound(f"No definition found for '{word}'")
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"word": entry.word, "phonetic": entry.phonetic, "respelling": entry.respelling,
                             "audio": entry.audio, "source": entry.source,
                             "meanings": [(pos, [s.__dict__ for s in senses]) for pos, senses in entry.meanings]}))
    return entry
