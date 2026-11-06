import pytest

from hpc_hub.agents.lock import qr
from hpc_hub.agents.lock.activity import activity, recent


@pytest.mark.parametrize("line, words", [
    ("2026-10-24 09:12:03 ok main (open 10 min)", "Oct 24, 09:12 · Code accepted, open for 10 min"),
    ("2026-10-23 18:40:00 wrong code 1 of 3 in main", "Oct 23, 18:40 · Wrong code, 1 of 3"),
    ("2026-10-22 11:05:09 set up", "Oct 22, 11:05 · Lock turned on"),
    ("2026-10-22 11:06:00 set minutes=5", "Oct 22, 11:06 · Lock settings changed"),
    ("something else", "something else"),
])
def test_activity_in_words(line, words):
    assert activity(line) == words


def test_recent_is_newest_first_and_short():
    log = [f"2026-10-{d:02d} 09:00:00 reset" for d in range(1, 13)]
    out = recent(log)
    assert len(out) == 10 and out[0] == "Oct 12, 09:00 · Unlocked" and out[-1] == "Oct 3, 09:00 · Unlocked"


def test_key_in_fours():
    assert qr.grouped("ABCDEFGHIJ") == "ABCD EFGH IJ"


def test_no_qr_without_qrencode(monkeypatch):
    monkeypatch.setattr(qr.shutil, "which", lambda _: None)
    assert qr.qr_png("otpauth://totp/x") == ""
