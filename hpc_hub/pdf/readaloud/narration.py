import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from . import env
from .align import align, fill_gaps
from .text import chunks
from .words import extract

VOICES = [  # every English voice edge-tts offers
    ("en-US-AriaNeural", "Aria (US, female)"),
    ("en-US-JennyNeural", "Jenny (US, female)"),
    ("en-US-AvaNeural", "Ava (US, female)"),
    ("en-US-EmmaNeural", "Emma (US, female)"),
    ("en-US-MichelleNeural", "Michelle (US, female)"),
    ("en-US-AnaNeural", "Ana (US, female)"),
    ("en-US-AvaMultilingualNeural", "Ava multilingual (US, female)"),
    ("en-US-EmmaMultilingualNeural", "Emma multilingual (US, female)"),
    ("en-US-AndrewNeural", "Andrew (US, male)"),
    ("en-US-BrianNeural", "Brian (US, male)"),
    ("en-US-ChristopherNeural", "Christopher (US, male)"),
    ("en-US-EricNeural", "Eric (US, male)"),
    ("en-US-GuyNeural", "Guy (US, male)"),
    ("en-US-RogerNeural", "Roger (US, male)"),
    ("en-US-SteffanNeural", "Steffan (US, male)"),
    ("en-US-AndrewMultilingualNeural", "Andrew multilingual (US, male)"),
    ("en-US-BrianMultilingualNeural", "Brian multilingual (US, male)"),
    ("en-GB-SoniaNeural", "Sonia (British, female)"),
    ("en-GB-LibbyNeural", "Libby (British, female)"),
    ("en-GB-MaisieNeural", "Maisie (British, female)"),
    ("en-GB-RyanNeural", "Ryan (British, male)"),
    ("en-GB-ThomasNeural", "Thomas (British, male)"),
    ("en-AU-NatashaNeural", "Natasha (Australian, female)"),
    ("en-AU-WilliamMultilingualNeural", "William multilingual (Australian, male)"),
    ("en-CA-ClaraNeural", "Clara (Canadian, female)"),
    ("en-CA-LiamNeural", "Liam (Canadian, male)"),
    ("en-IE-EmilyNeural", "Emily (Irish, female)"),
    ("en-IE-ConnorNeural", "Connor (Irish, male)"),
    ("en-IN-NeerjaNeural", "Neerja (Indian, female)"),
    ("en-IN-NeerjaExpressiveNeural", "Neerja expressive (Indian, female)"),
    ("en-IN-PrabhatNeural", "Prabhat (Indian, male)"),
    ("en-NZ-MollyNeural", "Molly (New Zealand, female)"),
    ("en-NZ-MitchellNeural", "Mitchell (New Zealand, male)"),
    ("en-ZA-LeahNeural", "Leah (South African, female)"),
    ("en-ZA-LukeNeural", "Luke (South African, male)"),
    ("en-SG-LunaNeural", "Luna (Singapore, female)"),
    ("en-SG-WayneNeural", "Wayne (Singapore, male)"),
    ("en-PH-RosaNeural", "Rosa (Philippine, female)"),
    ("en-PH-JamesNeural", "James (Philippine, male)"),
    ("en-KE-AsiliaNeural", "Asilia (Kenyan, female)"),
    ("en-KE-ChilembaNeural", "Chilemba (Kenyan, male)"),
    ("en-NG-EzinneNeural", "Ezinne (Nigerian, female)"),
    ("en-NG-AbeoNeural", "Abeo (Nigerian, male)"),
    ("en-TZ-ImaniNeural", "Imani (Tanzanian, female)"),
    ("en-TZ-ElimuNeural", "Elimu (Tanzanian, male)"),
    ("en-HK-YanNeural", "Yan (Hong Kong, female)"),
    ("en-HK-SamNeural", "Sam (Hong Kong, male)"),
]
BYTES_PER_SECOND = 48_000 / 8  # edge-tts sends 48 kbit/s MP3
WORKER = Path(__file__).with_name("worker.py")


@dataclass
class Narration:
    audio: Path
    duration: float
    words: list[list]  # [id, page, x0, y0, x1, y1]
    timings: list[list]  # [id, start, end], in reading order


def cache_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "hpc-hub" / "readaloud"


@dataclass
class Plan:
    key: str
    voice: str
    python: Path
    parts: list
    keys: list[str]

    def first_on(self, page: int) -> int:
        return next((i for i, c in enumerate(self.parts) if any(w.page >= page for w in c.words)), 0)


def _key(pdf: bytes, voice: str) -> str:
    return hashlib.sha256(pdf + voice.encode() + b"v2").hexdigest()[:20]  # v2: PyMuPDF reading order


def cached(pdf: bytes, voice: str) -> Narration | None:
    meta = cache_dir() / _key(pdf, voice) / "narration.json"
    if not meta.exists():
        return None
    raw = json.loads(meta.read_text())
    return Narration(meta.parent / "audio.mp3", raw["duration"], raw["words"], raw["timings"])


def _tidy() -> None:
    """Short first recordings left behind (the app closed before the full one arrived)."""
    now = time.time()
    for d in cache_dir().glob("part-*"):
        if now - d.stat().st_mtime > 3600:
            shutil.rmtree(d, ignore_errors=True)


def plan(pdf: bytes, voice: str, progress: Callable[[str], None] = lambda text: None) -> Plan:
    if cache_dir().exists():
        _tidy()
    py = env.python()
    if not py:
        progress("Setting up the voice (first time only)…")
        py = env.install()
    parts = chunks(extract(pdf, py))
    if not parts:
        raise ValueError("This PDF has no text to read")
    keys = [hashlib.sha256(f"{voice}\n{c.text}".encode()).hexdigest()[:24] for c in parts]
    return Plan(_key(pdf, voice), voice, py, parts, keys)


def _store() -> Path:
    # speech is kept per chunk, so after an edit only the chunks that changed are recorded again
    d = cache_dir() / "chunks"
    d.mkdir(parents=True, exist_ok=True)
    return d


def record(p: Plan, order: list[int], progress: Callable[[str], None] = lambda text: None) -> None:
    store = _store()
    todo = [i for i in order if not (store / f"{p.keys[i]}.json").exists()]
    if todo:
        _record(p.python, p.voice, [p.parts[i].text for i in todo], [p.keys[i] for i in todo], store, progress)


def assemble(p: Plan, first: int = 0, last: int | None = None, out: Path | None = None) -> Narration:
    """Chunks first..last (all recorded) as one MP3 and timeline, starting at 0."""
    store, last = _store(), len(p.parts) if last is None else last
    out = out or Path(tempfile.mkdtemp(prefix="part-", dir=cache_dir()))
    out.mkdir(parents=True, exist_ok=True)
    times: dict[int, tuple[float, float]] = {}
    elapsed = 0.0
    with open(out / "audio.mp3", "wb") as f:
        for c, k in zip(p.parts[first:last], p.keys[first:last]):
            audio = (store / f"{k}.mp3").read_bytes()
            f.write(audio)
            tokens = [tuple(t) for t in json.loads((store / f"{k}.json").read_text())]
            for wid, (start, end) in align(c.words, tokens).items():
                times[wid] = (start + elapsed, end + elapsed)
            elapsed += len(audio) / BYTES_PER_SECOND or (tokens[-1][2] if tokens else 0.0)
    in_chunks = [w for c in p.parts[first:last] for w in c.words]
    raw = {"duration": round(elapsed, 3), "timings": [list(t) for t in fill_gaps(in_chunks, times, elapsed)],
           "words": [[w.id, w.page, *(round(v, 2) for v in w.box)] for w in in_chunks]}
    (out / "narration.json").write_text(json.dumps(raw))
    return Narration(out / "audio.mp3", raw["duration"], raw["words"], raw["timings"])


def start_time(p: Plan, chunk: int) -> float:
    """Where a chunk starts in the whole narration (its earlier chunks must be recorded)."""
    store = _store()
    return sum((store / f"{k}.mp3").stat().st_size for k in p.keys[:chunk]) / BYTES_PER_SECOND


def full(p: Plan, progress: Callable[[str], None] = lambda text: None, after: int = 0) -> Narration:
    """Record whatever is missing (from chunk `after` on first, what you hear next) and cache the whole."""
    record(p, list(range(after, len(p.parts))) + list(range(after)), progress)
    d = cache_dir() / p.key
    tmp = d.with_name(p.key + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    n = assemble(p, out=tmp)
    shutil.rmtree(d, ignore_errors=True)
    tmp.rename(d)
    return Narration(d / "audio.mp3", n.duration, n.words, n.timings)


def _record(py: Path, voice: str, texts: list[str], keys: list[str], store: Path,
            progress: Callable[[str], None]) -> None:
    """Speech for the given chunks into store/<key>.mp3 + .json, through the edge-tts worker."""
    out = Path(tempfile.mkdtemp(prefix="incoming-", dir=store))  # one per run: two at once don't clash
    proc = subprocess.Popen([str(py), str(WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env.clean())
    proc.stdin.write(json.dumps({"voice": voice, "out": str(out), "chunks": texts}))
    proc.stdin.close()
    done = 0
    for line in proc.stdout:
        msg = json.loads(line)
        if "error" in msg:
            proc.kill()
            raise RuntimeError(f"Text to speech failed: {msg['error']}")
        i = msg["i"]
        (out / f"{i}.mp3").replace(store / f"{keys[i]}.mp3")
        (store / f"{keys[i]}.json").write_text(json.dumps(msg["tokens"]))  # last, so .json means complete
        done += 1
        progress(f"Recording {done} of {len(texts)}…")
    shutil.rmtree(out, ignore_errors=True)
    if proc.wait() != 0 or done != len(texts):
        err = proc.stderr.read().strip()
        raise RuntimeError(err.splitlines()[-1] if err else "Text to speech failed")


def say(word: str, voice: str) -> Path:
    """One word spoken by the reader voice (for words the dictionary has no recording of). Cached."""
    store = cache_dir() / "words"
    store.mkdir(parents=True, exist_ok=True)
    out = store / f"{voice}-{hashlib.sha256(word.lower().encode()).hexdigest()[:16]}.mp3"
    if not out.exists():
        py = env.python() or env.install()
        key = out.stem
        _record(py, voice, [word], [key], store, lambda text: None)
        (store / f"{key}.json").unlink(missing_ok=True)
    return out
