"""Read a PDF on a cluster aloud, and look its words up (pdf/readaloud).

readaloud.start makes the narration on a thread and reports as `readaloud` events: progress text, then `part` (a
few chunks from the page you are on, so reading starts within seconds), then `full` (the whole PDF, which the UI
swaps in at the same moment: offset is where the part began in it). The player streams the audio from a loopback URL
(pdf/readaloud/stream.py), so it starts at once; readaloud.audio still hands it over in pieces when that fails.
"""

import base64
import secrets
import socket
import threading
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from ...files import remote_fs
from ...pdf.readaloud import dictionary, narration, stream
from ..hub import hub
from ..server import method

FIRST_CHUNKS = 3  # recorded before reading starts (about a minute of speech)
CHUNK = 4 * 1024 * 1024
SOUND_LIMIT = 2 * 1024 * 1024
OFFLINE = "Read aloud needs the internet. Check your connection and try again."
DICTIONARY_OFFLINE = "The dictionary needs the internet. Check your connection and try again."
NO_VOICE = "Read aloud can't run on this device yet."
SPEECH_HOST = ("speech.platform.bing.com", 443)
DICTIONARY_HOST = ("api.dictionaryapi.dev", 443)

_lock = threading.Lock()
_jobs: dict[str, "Job"] = {}
_audio: dict[str, Path] = {}  # token -> an MP3 the UI may read
_sounds: dict[str, str] = {}  # word -> the dictionary's recording of it
_stream = stream.Server(lambda token: _audio.get(token))


@dataclass
class Job:
    id: str
    cluster: str
    path: str
    voice: str
    state: str = "starting"  # starting, part, full, error
    text: str = ""
    error: str = ""
    offline: bool = False
    narration: dict | None = None
    offset: float = 0.0
    n: int = 0  # bumps with every event, so the UI can drop an older answer
    stopped: bool = False

    def public(self) -> dict:
        return {"id": self.id, "state": self.state, "text": self.text, "error": self.error, "offline": self.offline,
                "narration": self.narration, "offset": self.offset, "n": self.n}


def online(host: tuple[str, int]) -> bool:
    try:
        with socket.create_connection(host, timeout=4):
            return True
    except OSError:
        return False


def _read(cluster: str, path: str) -> bytes:
    return remote_fs.read_bytes(hub().connected(cluster).ssh, path)


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": dictionary.AGENT})
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.read(SOUND_LIMIT)


def _token(path: Path) -> str:
    with _lock:
        token = secrets.token_hex(8)
        _audio[token] = path
        return token


def _url(token: str) -> str:
    try:
        return _stream.url(token)
    except OSError:
        return ""  # no loopback port: the UI reads the pieces instead


def _pack(n: narration.Narration) -> dict:
    token = _token(n.audio)
    return {"audio": token, "url": _url(token), "duration": n.duration, "words": n.words, "timings": n.timings}


def _send(job: Job, **changes) -> None:
    with _lock:
        if job.stopped:
            return
        for k, v in changes.items():
            setattr(job, k, v)
        job.n += 1
        data = job.public()
    hub().emit("readaloud", data)


def _trouble(e: Exception) -> tuple[str, bool]:
    """What to tell you when making the narration failed, and whether it is the internet."""
    if isinstance(e, (ValueError, remote_fs.FsError)) or str(e).startswith("Connect to "):
        return str(e), False
    if not online(SPEECH_HOST):
        return OFFLINE, True
    if isinstance(e, FileNotFoundError):  # no Python to set the voice up with (the phone)
        return NO_VOICE, False
    return str(e) or "Read aloud stopped", False


def log(text: str) -> None:
    """A line in ~/.cache/hpc-hub/readaloud.log: where Read aloud spends its time."""
    try:
        path = narration.cache_dir().parent / "readaloud.log"
        with path.open("a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {text}\n")
    except OSError:
        pass


def _work(job: Job, page: int) -> None:
    t0 = time.monotonic()

    def step(what: str) -> None:
        log(f"{job.id} {what} at {time.monotonic() - t0:.1f} s")
    try:
        pdf = _read(job.cluster, job.path)
        step(f"read the PDF ({len(pdf) // 1024} KB)")
        done = narration.cached(pdf, job.voice)
        if done:
            _send(job, state="full", text="", narration=_pack(done))
            step("sent the saved recording")
            return

        def progress(text: str) -> None:
            _send(job, text=text)
        plan = narration.plan(pdf, job.voice, progress)
        step(f"found the words ({len(plan.parts)} parts)")
        start = plan.first_on(page)
        end = min(start + FIRST_CHUNKS, len(plan.parts))
        narration.record(plan, list(range(start, end)), progress)
        step(f"recorded parts {start + 1} to {end}")
        if job.stopped:
            return
        if start == 0 and end == len(plan.parts):
            _send(job, state="full", text="", narration=_pack(narration.full(plan)))
            step("sent the whole recording")
            return
        _send(job, state="part", text="", narration=_pack(narration.assemble(plan, start, end)))
        step("sent the first part")
        whole = narration.full(plan, progress, start)
        _send(job, state="full", text="", narration=_pack(whole), offset=narration.start_time(plan, start))
        step("sent the whole recording")
    except Exception as e:  # noqa: BLE001 - every failure goes to the UI as plain words
        step(f"stopped: {e}")
        error, offline = _trouble(e)
        _send(job, state="error" if job.narration is None else job.state, text="", error=error, offline=offline)


@method("readaloud.trace")
def trace(text: str) -> None:
    """The player's side of the timings."""
    log(f"player: {text[:300]}")


@method("readaloud.voices")
def voices() -> dict:
    return {"voices": [{"id": v, "label": label} for v, label in narration.VOICES],
            "default": narration.VOICES[0][0]}


@method("readaloud.start")
def start(cluster: str, path: str, voice: str = "", page: int = 1) -> dict:
    """Make (or load from the cache) the narration of a PDF on a cluster, reading from page on first."""
    if voice not in dict(narration.VOICES):
        voice = narration.VOICES[0][0]
    job = Job(secrets.token_hex(6), cluster, path, voice)
    with _lock:
        _jobs[job.id] = job
    threading.Thread(target=_work, args=(job, max(1, int(page))), daemon=True, name=f"readaloud-{job.id}").start()
    return job.public()


@method("readaloud.follow")
def follow(id: str) -> dict | None:
    with _lock:
        job = _jobs.get(id)
        return job.public() if job else None


@method("readaloud.stop")
def stop(id: str) -> None:
    """Forget a narration that is still being made: its events stop."""
    with _lock:
        job = _jobs.pop(id, None)
        if job:
            job.stopped = True


@method("readaloud.audio")
def audio(token: str, offset: int = 0, length: int = CHUNK) -> dict:
    """Part of a narration's MP3 as base64, and its whole size."""
    path = _audio.get(token)
    if path is None:
        raise ValueError("That recording is gone, press Read aloud again")
    offset, length = max(0, int(offset)), max(1, min(int(length), CHUNK))
    with open(path, "rb") as f:
        f.seek(offset)
        data = f.read(length)
    return {"data": base64.b64encode(data).decode(), "total": path.stat().st_size}


def _entry(e: dictionary.Entry) -> dict:
    return {"word": e.word, "phonetic": e.phonetic, "respelling": e.respelling, "source": e.source,
            "meanings": [{"pos": pos, "senses": [{"definition": s.definition, "example": s.example,
                                                  "synonyms": s.synonyms[:6]} for s in senses]}
                         for pos, senses in e.meanings]}


@method("readaloud.lookup")
def lookup(word: str) -> dict:
    """How to say a word and what it means. A word that can't be found comes back with error set."""
    try:
        e = dictionary.lookup(word)
    except dictionary.NotFound as x:
        if not online(DICTIONARY_HOST):
            return {"word": word.strip(), "error": DICTIONARY_OFFLINE, "offline": True}
        return {"word": word.strip(), "error": str(x), "offline": False}
    if e.audio.startswith("https://"):
        with _lock:
            _sounds[e.word.lower()] = e.audio
            _sounds[dictionary.term(word)] = e.audio
    return {**_entry(e), "error": "", "offline": False}


@method("readaloud.say")
def say(word: str, voice: str = "", recording_only: bool = False) -> dict:
    """The word spoken: the dictionary's own recording when it has one, else the reader voice. Base64 MP3.
    recording_only: no reader voice (the phone says it with its own), so data is empty without a recording."""
    key = dictionary.term(word)
    url = _sounds.get(key)
    if url:
        try:
            return {"data": base64.b64encode(_fetch(url)).decode()}
        except OSError:
            pass  # the reader voice says it instead
    if recording_only:
        return {"data": ""}
    if voice not in dict(narration.VOICES):
        voice = narration.VOICES[0][0]
    try:
        data = narration.say(key, voice).read_bytes()
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(_trouble(e)[0]) from e
    return {"data": base64.b64encode(data).decode()}
