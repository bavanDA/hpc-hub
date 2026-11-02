import base64
import json
import time

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import readaloud as api
from hpc_hub.pdf.readaloud import dictionary, narration, text
from hpc_hub.pdf.readaloud.text import Word

WORDS = "One two. Three four. Five six. Seven eight. Nine ten.".split()


class FakeHub:
    def __init__(self):
        self.events: list[tuple[str, dict]] = []

    def emit(self, name, data):
        self.events.append((name, data))


def said(h, state, seconds=5):
    """The first readaloud event in that state (waits for the thread)."""
    end = time.time() + seconds
    while time.time() < end:
        for name, data in list(h.events):
            if name == "readaloud" and data["state"] == state:
                return data
        time.sleep(0.01)
    raise AssertionError(f"no {state} event in {h.events}")


@pytest.fixture
def h(monkeypatch, tmp_path):
    fake = FakeHub()
    monkeypatch.setattr(hub_module, "_hub", fake)
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    monkeypatch.setattr(api, "_read", lambda cluster, path: b"%PDF fake " + path.encode())
    monkeypatch.setattr(api, "online", lambda host: True)
    monkeypatch.setattr(narration.env, "python", lambda: tmp_path / "py")
    monkeypatch.setattr(narration, "extract",
                        lambda pdf, py: [Word(i, 1 + i // 4, w, (10, 10, 20, 20)) for i, w in enumerate(WORDS)])
    monkeypatch.setattr(narration, "chunks", lambda ws: text.chunks(ws, budget=8))
    recorded = []

    def record(py, voice, texts, keys, store, progress):  # the edge-tts worker: 1 s and a token per word
        for t, k in zip(texts, keys):
            (store / f"{k}.mp3").write_bytes(b"x" * int(narration.BYTES_PER_SECOND))
            spoken = [w.strip(".") for w in t.split()]
            (store / f"{k}.json").write_text(json.dumps([[w, 0.1 + 0.4 * i, 0.4 + 0.4 * i]
                                                         for i, w in enumerate(spoken)]))
            recorded.append(t)
            progress(f"Recording {len(recorded)} of {len(texts)}…")
    monkeypatch.setattr(narration, "_record", record)
    fake.recorded = recorded
    return fake


def test_voices_have_a_default():
    v = api.voices()
    assert v["default"] in [x["id"] for x in v["voices"]] and len(v["voices"]) > 10


def test_start_reads_from_the_page_then_swaps_in_the_whole(h):
    job = api.start("wulver", "/home/jdoe/paper.pdf", page=2)
    part = said(h, "part")
    assert part["id"] == job["id"] and part["narration"]["duration"] == 3.0
    assert part["narration"]["timings"][0][0] == 4  # page 2 starts at the fifth word
    assert h.recorded[0] == "Five six."  # what you hear first is recorded first
    full = said(h, "full")
    assert full["narration"]["duration"] == 5.0 and full["offset"] == 2.0 and full["n"] > part["n"]
    assert len(full["narration"]["words"]) == len(WORDS)
    assert any(d["text"].startswith("Recording") for _, d in h.events)
    assert api.follow(job["id"])["state"] == "full"

    got = api.audio(full["narration"]["audio"])
    assert got["total"] == 5 * narration.BYTES_PER_SECOND and len(base64.b64decode(got["data"])) == got["total"]
    piece = api.audio(full["narration"]["audio"], offset=100, length=10)
    assert base64.b64decode(piece["data"]) == b"x" * 10
    with pytest.raises(ValueError):
        api.audio("nope")


def test_a_second_time_comes_from_the_cache(h):
    api.start("wulver", "/home/jdoe/paper.pdf")
    said(h, "full")
    h.events.clear()
    h.recorded.clear()
    api.start("wulver", "/home/jdoe/paper.pdf")
    assert said(h, "full")["narration"]["duration"] == 5.0 and not h.recorded
    assert not any(d["state"] == "part" for _, d in h.events)


def test_offline_says_so_in_plain_words(h, monkeypatch):
    def broken(*args):
        raise RuntimeError("Text to speech failed: Cannot connect to host")
    monkeypatch.setattr(narration, "_record", broken)
    monkeypatch.setattr(api, "online", lambda host: False)
    api.start("wulver", "/home/jdoe/paper.pdf")
    err = said(h, "error")
    assert err["error"] == api.OFFLINE and err["offline"] and err["narration"] is None


def test_a_pdf_without_text_and_a_device_without_python(h, monkeypatch):
    monkeypatch.setattr(narration, "extract", lambda pdf, py: [])
    api.start("wulver", "/home/jdoe/scan.pdf")
    assert said(h, "error")["error"] == "This PDF has no text to read"
    h.events.clear()

    def no_python():
        raise FileNotFoundError("python3")
    monkeypatch.setattr(narration.env, "python", lambda: None)
    monkeypatch.setattr(narration.env, "install", no_python)
    api.start("wulver", "/home/jdoe/paper.pdf")
    assert said(h, "error")["error"] == api.NO_VOICE


def test_stop_drops_the_events(h, monkeypatch):
    monkeypatch.setattr(api, "_read", lambda cluster, path: time.sleep(0.1) or b"%PDF slow")
    job = api.start("wulver", "/home/jdoe/paper.pdf")
    api.stop(job["id"])
    time.sleep(0.2)
    assert api.follow(job["id"]) is None
    assert not any(d["state"] in ("part", "full") for _, d in h.events if d["id"] == job["id"])


FREE = [{"word": "algorithm", "phonetic": "/ˈælɡəɹɪðm̩/",
         "phonetics": [{"audio": "https://api.dictionaryapi.dev/media/algorithm-us.mp3"}],
         "meanings": [{"partOfSpeech": "noun", "definitions": [{"definition": "A set of steps.",
                                                                "example": "Sorting uses an algorithm."}]}]}]


def test_lookup_and_hear_the_word(h, monkeypatch):
    asked = []

    def get(url, tries=3):
        asked.append(url)
        if "algorithms" in url:
            raise dictionary.NotFound(url)
        return FREE
    monkeypatch.setattr(dictionary, "_get", get)
    monkeypatch.setattr(api, "_fetch", lambda url: b"ID3 " + url.encode())
    e = api.lookup("Algorithms,")
    assert e["word"] == "algorithm" and e["respelling"] == "AL-guh-ri-thuhm" and not e["error"]
    assert e["meanings"][0]["pos"] == "noun" and e["meanings"][0]["senses"][0]["example"]
    assert "audio" not in e  # the recording stays in the backend
    sound = base64.b64decode(api.say("algorithms")["data"])
    assert sound.startswith(b"ID3 https://api.dictionaryapi.dev/")
    n = len(asked)
    assert api.lookup("algorithms")["word"] == "algorithm" and len(asked) == n  # from the disk cache


def test_lookup_offline_and_not_found(h, monkeypatch):
    def down(url, tries=3):
        raise ConnectionError("The dictionary could not be reached")
    monkeypatch.setattr(dictionary, "_get", down)
    monkeypatch.setattr(api, "online", lambda host: False)
    e = api.lookup("census")
    assert e["error"] == api.DICTIONARY_OFFLINE and e["offline"]
    monkeypatch.setattr(api, "online", lambda host: True)
    monkeypatch.setattr(dictionary, "_get", lambda url, tries=3: (_ for _ in ()).throw(dictionary.NotFound(url)))
    assert api.lookup("zzxq")["error"] == "No definition found for 'zzxq'"
    assert "not a word" in api.lookup("3.5")["error"]


def test_say_with_the_reader_voice(h, monkeypatch, tmp_path):
    f = tmp_path / "w.mp3"
    f.write_bytes(b"spoken")
    used = []
    monkeypatch.setattr(narration, "say", lambda word, voice: used.append((word, voice)) or f)
    assert base64.b64decode(api.say("Census,", "en-GB-RyanNeural")["data"]) == b"spoken"
    assert used == [("census", "en-GB-RyanNeural")]

    def offline(word, voice):
        raise RuntimeError("Text to speech failed")
    monkeypatch.setattr(narration, "say", offline)
    monkeypatch.setattr(api, "online", lambda host: False)
    with pytest.raises(RuntimeError, match="needs the internet"):
        api.say("census")
