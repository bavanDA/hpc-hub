"""Make (or load from cache) the narration of a PDF: one MP3 plus a time span for every word."""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from . import env
from .align import align, fill_gaps
from .text import chunks
from .words import extract

VOICES = [("en-US-AriaNeural", "Aria (US, warm)"), ("en-US-AndrewNeural", "Andrew (US, confident)"),
          ("en-US-EmmaMultilingualNeural", "Emma (US, multilingual)"), ("en-GB-SoniaNeural", "Sonia (British)"),
          ("en-AU-NatashaNeural", "Natasha (Australian)")]
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


def build(pdf: bytes, voice: str, progress: Callable[[str], None] = lambda text: None) -> Narration:
    """Blocking: run off the UI thread. A PDF you already heard comes back from the cache at once."""
    key = hashlib.sha256(pdf + voice.encode()).hexdigest()[:20]
    d = cache_dir() / key
    meta = d / "narration.json"
    if meta.exists():
        raw = json.loads(meta.read_text())
        return Narration(d / "audio.mp3", raw["duration"], raw["words"], raw["timings"])

    py = env.python()
    if not py:
        progress("Setting up the voice (first time only)…")
        py = env.install()
    words = extract(pdf)
    parts = chunks(words)
    if not parts:
        raise ValueError("This PDF has no text to read")
    # speech is kept per chunk, so after an edit only the chunks that changed are recorded again
    store = cache_dir() / "chunks"
    store.mkdir(parents=True, exist_ok=True)
    keys = [hashlib.sha256(f"{voice}\n{c.text}".encode()).hexdigest()[:24] for c in parts]
    todo = [i for i, k in enumerate(keys) if not (store / f"{k}.json").exists()]
    if todo:
        _record(py, voice, [parts[i].text for i in todo], [keys[i] for i in todo], store, progress)

    tmp = d.with_name(key + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    times: dict[int, tuple[float, float]] = {}
    elapsed = 0.0
    with open(tmp / "audio.mp3", "wb") as out:
        for c, k in zip(parts, keys):
            audio = (store / f"{k}.mp3").read_bytes()
            out.write(audio)
            tokens = [tuple(t) for t in json.loads((store / f"{k}.json").read_text())]
            for wid, (start, end) in align(c.words, tokens).items():
                times[wid] = (start + elapsed, end + elapsed)
            elapsed += len(audio) / BYTES_PER_SECOND or (tokens[-1][2] if tokens else 0.0)
    in_chunks = [w for c in parts for w in c.words]
    timings = [list(t) for t in fill_gaps(in_chunks, times, elapsed)]
    raw = {"duration": round(elapsed, 3), "timings": timings,
           "words": [[w.id, w.page, *(round(v, 2) for v in w.box)] for w in in_chunks]}
    (tmp / "narration.json").write_text(json.dumps(raw))
    shutil.rmtree(d, ignore_errors=True)
    tmp.rename(d)
    return Narration(d / "audio.mp3", raw["duration"], raw["words"], raw["timings"])


def _record(py: Path, voice: str, texts: list[str], keys: list[str], store: Path,
            progress: Callable[[str], None]) -> None:
    """Speech for the given chunks into store/<key>.mp3 + .json, through the edge-tts worker."""
    out = Path(tempfile.mkdtemp(prefix="incoming-", dir=store))  # one per run: two at once don't clash
    proc = subprocess.Popen([str(py), str(WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
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
