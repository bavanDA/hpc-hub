import urllib.error
import urllib.request

import pytest

from hpc_hub.pdf.readaloud import stream


def test_span_reads_range_headers():
    assert stream.span(None, 100) == (0, 99)
    assert stream.span("bytes=10-19", 100) == (10, 19)
    assert stream.span("bytes=90-", 100) == (90, 99)
    assert stream.span("bytes=-5", 100) == (95, 99)
    assert stream.span("bytes=50-500", 100) == (50, 99)
    assert stream.span("bytes=100-", 100) is None
    assert stream.span("bytes=-", 100) is None
    assert stream.span("lines=1-2", 100) is None
    assert stream.span(None, 0) is None


@pytest.fixture
def served(tmp_path):
    mp3 = tmp_path / "audio.mp3"
    mp3.write_bytes(bytes(range(256)) * 40)
    server = stream.Server({"abc123": mp3}.get)
    yield server, mp3
    server.close()


def _get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=5) as r:
        return r.status, dict(r.headers), r.read()


def test_serves_the_whole_file_and_ranges(served):
    server, mp3 = served
    url = server.url("abc123")
    assert url.startswith("http://127.0.0.1:") and url.endswith("/audio/abc123.mp3")
    status, headers, body = _get(url)
    assert (status, headers["Content-Type"], headers["Accept-Ranges"]) == (200, "audio/mpeg", "bytes")
    assert body == mp3.read_bytes()
    status, headers, body = _get(url, {"Range": "bytes=1000-1009"})
    assert (status, headers["Content-Range"], body) == (206, f"bytes 1000-1009/{len(mp3.read_bytes())}",
                                                        mp3.read_bytes()[1000:1010])


def test_unknown_tokens_and_bad_ranges_fail(served):
    server, _ = served
    url = server.url("abc123")
    with pytest.raises(urllib.error.HTTPError) as e:
        _get(url.replace("abc123", "def456"))
    assert e.value.code == 404
    with pytest.raises(urllib.error.HTTPError) as e:
        _get(url, {"Range": "bytes=999999-"})
    assert e.value.code == 416
    with pytest.raises(urllib.error.HTTPError) as e:
        _get(url.replace("/audio/", "/etc/"))
    assert e.value.code == 404
